// Google Calendar sync: mirrors each task's desired events (events.ts) into a dedicated
// "Toque" calendar, reconciling like the notification outbox. Every public function is a no-op
// when Google isn't connected, and the sync functions never throw: failures are written to
// google_connection.last_error so a scan or a notification is never broken by Google.
// Neon HTTP has no transactions, so each step is one idempotent statement.

import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/server/db";
import { buildTask, getTaskById } from "@/server/db/queries";
import { EMPTY_TASK_STATE, type EngineTaskState } from "@/server/engine/kinds/types";
import { getGoogleAccessToken, getGoogleConnection, GoogleAuthError, isGoogleConnected, setGoogleLastError } from "@/server/google";
import type { Task } from "@/shared/tasks";
import { TIMEZONE } from "@/shared/time";
import { buildDesiredCalendarEvents, isPastEventKept, type DesiredCalendarEvent } from "./events";
import { createGoogleCalendarClient, type GoogleCalendarClient } from "./google-client";

export { buildDesiredCalendarEvents, CALENDAR_HORIZON_DAYS } from "./events";
export type { GoogleCalendarClient } from "./google-client";

const { calendarEvents, googleConnection, taskState, tasks } = schema;

const CALENDAR_NAME = "Toque";
/** runTick rolls the horizon forward at most this often. */
export const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;

type CalendarEventRow = typeof calendarEvents.$inferSelect;

function createDefaultClient(): GoogleCalendarClient {
  return createGoogleCalendarClient({
    getAccessToken: async (options) => getGoogleAccessToken({ forceRefresh: options?.forceRefresh }),
  });
}

let createClient: () => GoogleCalendarClient = createDefaultClient;

/** Tests inject a fake Google client; null restores the real one. */
export function setCalendarClientFactory(factory: (() => GoogleCalendarClient) | null): void {
  createClient = factory ?? createDefaultClient;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Connected → { db, client }; otherwise null (everything becomes a no-op). */
async function getSyncContext(): Promise<{ db: Db; client: GoogleCalendarClient } | null> {
  const db = await getDb();
  if (!isGoogleConnected(await getGoogleConnection(db))) return null;
  return { db, client: createClient() };
}

/** Records a failure for the settings page; auth "not connected" is not an error. */
async function recordSyncError(db: Db, error: unknown): Promise<void> {
  if (error instanceof GoogleAuthError && error.code === "not_connected") return;
  console.error("calendar sync failed", error);
  await setGoogleLastError(db, `Sincronização com o Google Calendar falhou: ${getErrorMessage(error)}`).catch(() => {});
}

/** Marks every live event row as deleted (its calendar is gone). */
async function markAllEventsDeleted(db: Db, now: Date) {
  await db.update(calendarEvents).set({ deletedAt: now }).where(isNull(calendarEvents.deletedAt));
}

/**
 * The stored "Toque" calendar id, creating the calendar when missing.
 * `verify` checks it still exists in Google (it may have been deleted there).
 * Two racing creators: the first stored id wins and the loser deletes its own calendar.
 */
async function ensureCalendarId(db: Db, client: GoogleCalendarClient, now: Date, verify: boolean): Promise<string> {
  const connection = await getGoogleConnection(db);
  if (connection?.calendarId) {
    if (!verify || (await client.getCalendar(connection.calendarId))) return connection.calendarId;
    // Deleted in Google: forget it and its events, then create a new one.
    await db
      .update(googleConnection)
      .set({ calendarId: null })
      .where(and(eq(googleConnection.id, 1), eq(googleConnection.calendarId, connection.calendarId)));
    await markAllEventsDeleted(db, now);
  }

  const created = await client.createCalendar({ summary: CALENDAR_NAME, timeZone: TIMEZONE });
  const [stored] = await db
    .update(googleConnection)
    .set({ calendarId: created.id })
    .where(and(eq(googleConnection.id, 1), isNull(googleConnection.calendarId)))
    .returning({ calendarId: googleConnection.calendarId });
  if (stored?.calendarId) return stored.calendarId;

  await client.deleteCalendar(created.id);
  const winner = await getGoogleConnection(db);
  if (!winner?.calendarId) throw new Error("Calendário Toque sem id");
  return winner.calendarId;
}

/** Creates the "Toque" secondary calendar if missing (Europe/Lisbon) and returns its id. */
export async function ensureToqueCalendar(): Promise<string> {
  const context = await getSyncContext();
  if (!context) throw new GoogleAuthError("not_connected", "Google Calendar não ligado");
  return ensureCalendarId(context.db, context.client, new Date(), true);
}

/** Deletes the "Toque" calendar in Google (with all its events) and forgets it. */
export async function deleteToqueCalendar(): Promise<void> {
  const context = await getSyncContext();
  if (!context) return;
  const { db, client } = context;
  const connection = await getGoogleConnection(db);
  if (!connection?.calendarId) return;
  await client.deleteCalendar(connection.calendarId);
  await db
    .update(googleConnection)
    .set({ calendarId: null })
    .where(and(eq(googleConnection.id, 1), eq(googleConnection.calendarId, connection.calendarId)));
  await markAllEventsDeleted(db, new Date());
}

async function createGoogleEvent(db: Db, client: GoogleCalendarClient, calendarId: string, row: CalendarEventRow, event: DesiredCalendarEvent, now: Date) {
  const { id } = await client.insertEvent(calendarId, event.body);
  await db
    .update(calendarEvents)
    .set({ googleEventId: id, start: event.start, end: event.end, contentHash: event.hash, syncedAt: now })
    .where(eq(calendarEvents.id, row.id));
}

async function deleteGoogleEvent(db: Db, client: GoogleCalendarClient, calendarId: string, row: CalendarEventRow, now: Date) {
  if (row.googleEventId) await client.deleteEvent(calendarId, row.googleEventId);
  await db.update(calendarEvents).set({ deletedAt: now }).where(eq(calendarEvents.id, row.id));
}

/**
 * Brings one task's events in line with what it should have: create the missing ones,
 * update those whose content hash changed, delete the rest. Errors are per event: one
 * failing event doesn't stop the others; the first failure is rethrown at the end.
 */
async function reconcileTaskEvents(
  db: Db,
  client: GoogleCalendarClient,
  calendarId: string,
  task: Task | null,
  taskId: string,
  now: Date,
): Promise<void> {
  const desired: DesiredCalendarEvent[] = task
    ? buildDesiredCalendarEvents(task, await getEngineState(db, taskId), now)
    : [];
  const live = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.taskId, taskId), isNull(calendarEvents.deletedAt)));
  const liveByKey = new Map(live.map((row) => [row.occurrenceKey, row]));
  const desiredKeys = new Set(desired.map((event) => event.occurrenceKey));
  const failures: unknown[] = [];
  const attempt = async (step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  };

  for (const event of desired) {
    await attempt(async () => {
      const row = liveByKey.get(event.occurrenceKey);
      if (!row) {
        // Claim the occurrence first (insert, or revive a deleted row); only the claimer creates
        // it in Google, so two overlapping syncs don't create duplicates.
        const [claimed] = await db
          .insert(calendarEvents)
          .values({ taskId, occurrenceKey: event.occurrenceKey, start: event.start, end: event.end, contentHash: "" })
          .onConflictDoUpdate({
            target: [calendarEvents.taskId, calendarEvents.occurrenceKey],
            set: { deletedAt: null, googleEventId: null, contentHash: "", syncedAt: null },
            setWhere: isNotNull(calendarEvents.deletedAt),
          })
          .returning();
        if (claimed) await createGoogleEvent(db, client, calendarId, claimed, event, now);
        return;
      }
      if (!row.googleEventId) return createGoogleEvent(db, client, calendarId, row, event, now);
      if (row.contentHash === event.hash) return;
      const updated = await client.updateEvent(calendarId, row.googleEventId, event.body);
      if (!updated) return createGoogleEvent(db, client, calendarId, row, event, now); // gone in Google
      await db
        .update(calendarEvents)
        .set({ start: event.start, end: event.end, contentHash: event.hash, syncedAt: now })
        .where(eq(calendarEvents.id, row.id));
    });
  }

  for (const row of live) {
    if (desiredKeys.has(row.occurrenceKey) || isPastEventKept(task, row.occurrenceKey, now)) continue;
    await attempt(() => deleteGoogleEvent(db, client, calendarId, row, now));
  }
  if (failures.length > 0) throw failures[0];
}

async function getEngineState(db: Db, taskId: string): Promise<EngineTaskState> {
  const [row] = await db.select().from(taskState).where(eq(taskState.taskId, taskId));
  if (!row) return { ...EMPTY_TASK_STATE };
  const { timerStartedAt, timerEndsAt, lastDoneAt, lastAckDate, snoozedUntil } = row;
  return { timerStartedAt, timerEndsAt, lastDoneAt, lastAckDate, snoozedUntil };
}

/**
 * Reconciles one task's events (deleted/disabled task → its events are removed).
 * Never throws; a no-op when Google isn't connected.
 */
export async function syncTaskCalendarEvents(taskId: string, now: Date): Promise<void> {
  const context = await getSyncContext().catch(() => null);
  if (!context) return;
  const { db, client } = context;
  try {
    const calendarId = await ensureCalendarId(db, client, now, false);
    const task = await getTaskById(db, taskId);
    await reconcileTaskEvents(db, client, calendarId, task, taskId, now);
    // A deleted task's rows already lost their task_id (FK set null): clean them up now.
    if (!task) await deleteOrphanEvents(db, client, calendarId, now);
    await setGoogleLastError(db, null);
  } catch (error) {
    await recordSyncError(db, error);
  }
}

async function runFullSync(db: Db, client: GoogleCalendarClient, now: Date): Promise<void> {
  const calendarId = await ensureCalendarId(db, client, now, true);
  const failures: unknown[] = [];
  for (const row of await db.select().from(tasks)) {
    await reconcileTaskEvents(db, client, calendarId, buildTask(row), row.id, now).catch((error) => failures.push(error));
  }
  await deleteOrphanEvents(db, client, calendarId, now).catch((error) => failures.push(error));
  if (failures.length > 0) throw failures[0];
}

/** Events of deleted tasks (task_id set null by the FK). */
async function deleteOrphanEvents(db: Db, client: GoogleCalendarClient, calendarId: string, now: Date) {
  const orphans = await db
    .select()
    .from(calendarEvents)
    .where(and(isNull(calendarEvents.taskId), isNull(calendarEvents.deletedAt)));
  const failures: unknown[] = [];
  for (const row of orphans) {
    await deleteGoogleEvent(db, client, calendarId, row, now).catch((error) => failures.push(error));
  }
  if (failures.length > 0) throw failures[0];
}

/** Full reconcile of every task (rolls the horizon forward). Never throws. */
export async function syncAllCalendarEvents(now: Date): Promise<void> {
  const context = await getSyncContext().catch(() => null);
  if (!context) return;
  const { db, client } = context;
  try {
    await runFullSync(db, client, now);
    await db.update(googleConnection).set({ lastSyncAt: now, lastError: null }).where(eq(googleConnection.id, 1));
  } catch (error) {
    await recordSyncError(db, error);
  }
}

/**
 * For runTick: a full sync at most once per hour. The hour is claimed atomically on
 * google_connection.last_sync_at, so overlapping ticks don't both run it. Never throws.
 */
export async function syncAllCalendarEventsIfDue(now: Date): Promise<boolean> {
  const context = await getSyncContext().catch(() => null);
  if (!context) return false;
  const { db, client } = context;
  try {
    const [claimed] = await db
      .update(googleConnection)
      .set({ lastSyncAt: now })
      .where(
        and(
          eq(googleConnection.id, 1),
          isNull(googleConnection.brokenAt),
          or(
            isNull(googleConnection.lastSyncAt),
            lte(googleConnection.lastSyncAt, sql`${new Date(now.getTime() - FULL_SYNC_INTERVAL_MS)}`),
          ),
        ),
      )
      .returning({ id: googleConnection.id });
    if (!claimed) return false;
    await runFullSync(db, client, now);
    await setGoogleLastError(db, null);
    return true;
  } catch (error) {
    await recordSyncError(db, error);
    return false;
  }
}
