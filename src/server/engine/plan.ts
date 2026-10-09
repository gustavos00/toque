import type { Task } from "@/shared/tasks";
import { getLocalTime } from "@/shared/time";
import { getKindHandler } from "./kinds/registry";
import type {
  EngineTaskState,
  PlanContext,
  PlannedNotification,
} from "./kinds/types";
import { buildNotificationKey, readOccurrenceFromKey } from "./keys";
import { applyQuietHours } from "./quiet-hours";

/**
 * Snooze is kind-agnostic: while `snoozedUntil` is set (it is cleared when the task is done),
 * every row due before it is replaced by a single reminder at `snoozedUntil`, reusing the
 * content of the latest replaced row.
 */
function applySnooze(
  task: Task,
  rows: PlannedNotification[],
  snoozedUntil: Date | null,
): PlannedNotification[] {
  if (!snoozedUntil) return rows;
  const until = snoozedUntil.getTime();
  const held = rows.filter((row) => row.dueAt.getTime() < until);
  if (held.length === 0) return rows;
  const latest = held.reduce((a, b) =>
    b.dueAt.getTime() >= a.dueAt.getTime() ? b : a,
  );
  const snoozeRow: PlannedNotification = {
    ...latest,
    key: buildNotificationKey(
      "snooze",
      task.id,
      readOccurrenceFromKey(latest.key) ?? "none",
      until,
    ),
    dueAt: snoozedUntil,
    expiresAt: null,
    payload: {
      ...latest.payload,
      message: `Adiado até às ${getLocalTime(snoozedUntil)}. ${latest.payload.message}`,
    },
  };
  return [...rows.filter((row) => row.dueAt.getTime() >= until), snoozeRow];
}

/** Several rows of one task landing on the same instant (e.g. after quiet hours) collapse into the last one. */
function collapseSameInstant(
  rows: PlannedNotification[],
): PlannedNotification[] {
  const byInstant = new Map<number, PlannedNotification>();
  for (const row of rows) byInstant.set(row.dueAt.getTime(), row);
  return [...byInstant.values()].sort(
    (a, b) => a.dueAt.getTime() - b.dueAt.getTime(),
  );
}

/**
 * The outbox rows a task should have right now, after snooze and quiet hours.
 * Pending rows not in this list are cancelled by the engine.
 */
export function buildDesiredNotifications(
  task: Task,
  state: EngineTaskState,
  ctx: PlanContext,
): PlannedNotification[] {
  if (!task.enabled) return [];
  const planned = getKindHandler(task).planNotifications(task, state, ctx);
  const snoozed = applySnooze(task, planned, state.snoozedUntil);
  const quieted = snoozed.flatMap((row) => {
    const dueAt = applyQuietHours(
      row.dueAt,
      ctx.settings.quietHours,
      row.expiresAt,
    );
    return dueAt ? [{ ...row, dueAt }] : [];
  });
  return collapseSameInstant(quieted);
}
