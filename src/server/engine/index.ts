// Toque engine: DB-driven scheduler. No in-memory timers — every change (scan, "feito",
// snooze, config edit, tick) recomputes the task's desired outbox rows and reconciles them
// with the `notifications` table; /api/tick then sends what is due.
//
// Outbox row lifecycle:
//   planned (dedupe_key) → inserted pending → [quiet-hours/snooze move its due_at]
//     → claimed by a tick (sent_at set atomically) → sent | failed (sent_at reset, retried)
//     → or cancelled (no longer desired / superseded by a later row of the same task).
// Every write is a single idempotent statement (Neon HTTP has no transactions).

import { and, asc, eq, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { syncAllCalendarEvents, syncAllCalendarEventsIfDue, syncTaskCalendarEvents } from "@/server/calendar";
import { getDb, schema, type Db } from "@/server/db";
import { buildTask, getSettings, getTaskById } from "@/server/db/queries";
import {
  buildOutgoingNotification,
  createNotifierFromSettings,
  verifyActionToken,
  type Notifier,
  type SignedActionParams,
} from "@/server/notify";
import type { ScanResult } from "@/shared/scan";
import type { Settings } from "@/shared/settings";
import type { TagAction } from "@/shared/tags";
import type { Task } from "@/shared/tasks";
import { getLocalTime } from "@/shared/time";
import { selectRowsToSend } from "./catch-up";
import { readOccurrenceFromKey } from "./keys";
import { getKindHandler } from "./kinds/registry";
import { EMPTY_TASK_STATE, type EngineTaskState, type TaskOutcome } from "./kinds/types";
import { buildDesiredNotifications } from "./plan";
import { addMinutes } from "./time";

export { readSignedActionParams } from "@/server/notify";

const { notifications, taskState, events, tasks } = schema;

/** After this many failed sends a row is given up (cancelled with its last error). */
const MAX_SEND_ATTEMPTS = 5;

type TaskStateRow = typeof taskState.$inferSelect;

function buildEngineState(row: TaskStateRow | undefined): EngineTaskState {
  if (!row) return { ...EMPTY_TASK_STATE };
  return {
    timerStartedAt: row.timerStartedAt,
    timerEndsAt: row.timerEndsAt,
    lastDoneAt: row.lastDoneAt,
    lastAckDate: row.lastAckDate,
    snoozedUntil: row.snoozedUntil,
  };
}

async function getTaskState(db: Db, taskId: string): Promise<EngineTaskState> {
  const [row] = await db.select().from(taskState).where(eq(taskState.taskId, taskId));
  return buildEngineState(row);
}

async function saveTaskState(db: Db, taskId: string, patch: Partial<EngineTaskState>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db
    .insert(taskState)
    .values({ taskId, ...patch })
    .onConflictDoUpdate({ target: taskState.taskId, set: { ...patch, updatedAt: new Date() } });
}

async function insertEvents(db: Db, task: Task, tagId: string | null, outcome: TaskOutcome, now: Date) {
  if (outcome.events.length === 0) return;
  await db.insert(events).values(
    outcome.events.map((event) => ({ at: now, type: event.type, taskId: task.id, tagId, data: event.data ?? {} })),
  );
}

/** Upserts the task's desired rows and cancels its pending rows that are no longer desired. */
async function reconcileTask(db: Db, task: Task, state: EngineTaskState, settings: Settings, now: Date) {
  const desired = buildDesiredNotifications(task, state, { now, settings });

  if (desired.length > 0) {
    await db
      .insert(notifications)
      .values(
        desired.map((row) => ({
          taskId: task.id,
          kind: row.kind,
          dueAt: row.dueAt,
          payload: row.payload,
          dedupeKey: row.key,
        })),
      )
      .onConflictDoUpdate({
        target: notifications.dedupeKey,
        set: {
          dueAt: sql`excluded.due_at`,
          payload: sql`excluded.payload`,
          kind: sql`excluded.kind`,
          cancelledAt: sql`null`,
        },
        // Never touch sent rows; revive a cancelled row only if it is in the future again
        // (e.g. task re-enabled) — past cancelled/superseded rows stay dead.
        setWhere: sql`${notifications.sentAt} is null and (${notifications.cancelledAt} is null or excluded.due_at > ${now})`,
      });
  }

  const desiredKeys = desired.map((row) => row.key);
  await db
    .update(notifications)
    .set({ cancelledAt: now })
    .where(
      and(
        eq(notifications.taskId, task.id),
        isNull(notifications.sentAt),
        isNull(notifications.cancelledAt),
        desiredKeys.length > 0 ? notInArray(notifications.dedupeKey, desiredKeys) : undefined,
      ),
    );
}

function buildInfoResult(title: string, message: string): ScanResult {
  return { title, message, tone: "info" };
}

/** Applies a handler outcome: state, history, then the task's schedule. */
async function applyOutcome(db: Db, task: Task, state: EngineTaskState, outcome: TaskOutcome, tagId: string | null, now: Date) {
  await saveTaskState(db, task.id, outcome.patch);
  await insertEvents(db, task, tagId, outcome, now);
  await reconcileTask(db, task, { ...state, ...outcome.patch }, await getSettings(db), now);
  // Never throws: Google problems end up in google_connection.last_error.
  await syncTaskCalendarEvents(task.id, now);
  return outcome.result;
}

/**
 * NFC scan of a tag linked to `taskId`. The scan event itself is logged by the route.
 * `action` is the tag's role: "start" or "complete" (e.g. the clothes-rack tag,
 * which behaves like the "Feito"/"Já tratei" button).
 */
export async function handleScan(input: {
  taskId: string;
  tagId: string;
  action: TagAction;
  now: Date;
}): Promise<ScanResult> {
  const db = await getDb();
  const task = await getTaskById(db, input.taskId);
  if (!task) return buildInfoResult("Tag sem tarefa", "A tarefa desta tag já não existe.");
  if (!task.enabled) return buildInfoResult(task.name, "Esta tarefa está desativada.");
  const state = await getTaskState(db, task.id);
  const handler = getKindHandler(task);
  const outcome =
    input.action === "complete" ? handler.handleDone(task, state, input.now) : handler.handleScan(task, state, input.now);
  return applyOutcome(db, task, state, outcome, input.tagId, input.now);
}

/** "Feito" from a notification (or the app): completes / acknowledges / confirms the task. */
export async function handleTaskDone(taskId: string, now: Date): Promise<ScanResult> {
  const db = await getDb();
  const task = await getTaskById(db, taskId);
  if (!task) return buildInfoResult("Tarefa", "A tarefa já não existe.");
  const state = await getTaskState(db, task.id);
  const outcome = getKindHandler(task).handleDone(task, state, now);
  return applyOutcome(db, task, state, outcome, null, now);
}

/** "Adiar" from a notification: holds the task's notifications for `settings.defaults.snoozeMinutes`. */
export async function handleTaskSnooze(taskId: string, now: Date): Promise<ScanResult> {
  const db = await getDb();
  const task = await getTaskById(db, taskId);
  if (!task) return buildInfoResult("Tarefa", "A tarefa já não existe.");
  const settings = await getSettings(db);
  const until = addMinutes(now, settings.defaults.snoozeMinutes);
  const state = await getTaskState(db, task.id);
  const outcome: TaskOutcome = {
    patch: { snoozedUntil: until },
    events: [{ type: "snoozed", data: { until: until.toISOString() } }],
    result: { title: task.name, message: `Adiado. Volto a lembrar às ${getLocalTime(until)}.`, tone: "info" },
  };
  return applyOutcome(db, task, state, outcome, null, now);
}

/**
 * Entry point for POST /api/actions/<action>?task=&occ=&exp=&sig= (ntfy buttons).
 * Verifies the HMAC signature and expiry, checks the link's occurrence is still the task's
 * current one (otherwise an info "Este aviso já não está ativo." and nothing changes),
 * then runs "done" or "snooze".
 */
export async function handleNotificationAction(
  params: SignedActionParams,
  now: Date,
): Promise<{ ok: true; result: ScanResult } | { ok: false; status: 400 | 403; reason: string }> {
  const verified = verifyActionToken(params, now);
  if (!verified.ok) {
    return { ok: false, status: verified.reason === "bad_action" || verified.reason === "malformed" ? 400 : 403, reason: verified.reason };
  }
  const db = await getDb();
  const task = await getTaskById(db, verified.taskId);
  if (!task) return { ok: true, result: buildInfoResult("Tarefa", "A tarefa já não existe.") };
  // Button from an older alert (yesterday's rubbish, a previous timer cycle…): change nothing.
  const current = getKindHandler(task).getCurrentOccurrence(task, await getTaskState(db, task.id), now);
  if (current !== verified.occurrence) {
    return { ok: true, result: buildInfoResult(task.name, "Este aviso já não está ativo.") };
  }
  const result =
    verified.action === "done" ? await handleTaskDone(verified.taskId, now) : await handleTaskSnooze(verified.taskId, now);
  return { ok: true, result };
}

/**
 * Rebuilds a task's future schedule. Call after creating/updating/enabling/disabling a task
 * (and after deleting it — pending rows are then cancelled, though the FK cascade also removes them).
 */
export async function rescheduleTask(taskId: string, now: Date): Promise<void> {
  const db = await getDb();
  const task = await getTaskById(db, taskId);
  if (!task) {
    await db
      .update(notifications)
      .set({ cancelledAt: now })
      .where(and(eq(notifications.taskId, taskId), isNull(notifications.sentAt), isNull(notifications.cancelledAt)));
  } else {
    await reconcileTask(db, task, await getTaskState(db, task.id), await getSettings(db), now);
  }
  await syncTaskCalendarEvents(taskId, now);
}

/** Re-plans every task — call after settings change (quiet hours, snooze length…). */
export async function rescheduleAllTasks(now: Date): Promise<void> {
  const db = await getDb();
  await reconcileAllTasks(db, await getSettings(db), now);
  await syncAllCalendarEvents(now);
}

async function reconcileAllTasks(db: Db, settings: Settings, now: Date) {
  const [taskRows, stateRows] = await Promise.all([db.select().from(tasks), db.select().from(taskState)]);
  const statesById = new Map(stateRows.map((row) => [row.taskId, row]));
  for (const row of taskRows) {
    await reconcileTask(db, buildTask(row), buildEngineState(statesById.get(row.id)), settings, now);
  }
}

/** Atomic claim: only one tick can stamp sent_at on a row. */
async function claimNotification(db: Db, id: string, now: Date) {
  const [claimed] = await db
    .update(notifications)
    .set({ sentAt: now, attempts: sql`${notifications.attempts} + 1` })
    .where(and(eq(notifications.id, id), isNull(notifications.sentAt), isNull(notifications.cancelledAt)))
    .returning();
  return claimed ?? null;
}

/**
 * Called every minute by /api/tick. Rolls schedules forward, then sends due rows:
 * per task only the latest due row (older due rows are superseded), each claimed atomically.
 * `deps.notifier` overrides the configured provider (tests); null = sending disabled.
 */
export async function runTick(now: Date, deps: { notifier?: Notifier | null } = {}): Promise<{ sent: number }> {
  const result = await sendDueNotifications(now, deps);
  // Rolls the calendar horizon forward at most once per hour; never throws.
  await syncAllCalendarEventsIfDue(now);
  return result;
}

async function sendDueNotifications(now: Date, deps: { notifier?: Notifier | null }): Promise<{ sent: number }> {
  const db = await getDb();
  const settings = await getSettings(db);
  await reconcileAllTasks(db, settings, now);

  const notifier = deps.notifier === undefined ? createNotifierFromSettings(settings) : deps.notifier;
  if (!notifier) return { sent: 0 };

  const due = await db
    .select()
    .from(notifications)
    .where(and(lte(notifications.dueAt, now), isNull(notifications.sentAt), isNull(notifications.cancelledAt)))
    .orderBy(asc(notifications.dueAt));
  const { send, supersede } = selectRowsToSend(due);

  if (supersede.length > 0) {
    await db
      .update(notifications)
      .set({ cancelledAt: now, lastError: "superseded" })
      .where(
        and(
          inArray(
            notifications.id,
            supersede.map((row) => row.id),
          ),
          isNull(notifications.sentAt),
          isNull(notifications.cancelledAt),
        ),
      );
  }

  let sent = 0;
  for (const row of send) {
    const claimed = await claimNotification(db, row.id, now);
    if (!claimed) continue;
    try {
      await notifier.send(
        buildOutgoingNotification({
          kind: claimed.kind,
          payload: claimed.payload,
          taskId: claimed.taskId,
          occurrence: readOccurrenceFromKey(claimed.dedupeKey),
          now,
          snoozeMinutes: settings.defaults.snoozeMinutes,
        }),
      );
      sent++;
      const sentEvents = [
        { at: now, type: "notification_sent" as const, taskId: claimed.taskId, data: { notificationId: claimed.id, kind: claimed.kind } },
        ...(claimed.kind === "timer_finished"
          ? [{ at: now, type: "timer_finished" as const, taskId: claimed.taskId, data: { notificationId: claimed.id } }]
          : []),
      ];
      await db.insert(events).values(sentEvents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const givesUp = claimed.attempts >= MAX_SEND_ATTEMPTS;
      await db
        .update(notifications)
        .set({ sentAt: null, lastError: message, cancelledAt: givesUp ? now : null })
        .where(eq(notifications.id, claimed.id));
      await db.insert(events).values({
        at: now,
        type: "notification_failed",
        taskId: claimed.taskId,
        data: { notificationId: claimed.id, error: message },
      });
    }
  }
  return { sent };
}
