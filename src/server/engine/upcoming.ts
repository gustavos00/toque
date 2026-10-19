import { getDb, schema } from "@/server/db";
import { buildTask, getSettings } from "@/server/db/queries";
import {
  ACTION_TOKEN_TTL_MS,
  createActionUrl,
  getActionSecret,
} from "@/server/notify/action-token";
import { readOccurrenceFromKey } from "./keys";
import { EMPTY_TASK_STATE, type EngineTaskState } from "./kinds/types";
import { buildDesiredNotifications } from "./plan";

export type UpcomingReminder = {
  /** Outbox dedupe key: stable, so the app can use it as notification identifier. */
  id: string;
  taskId: string;
  taskName: string;
  title: string;
  message: string;
  priority: number;
  dueAt: string;
  /** Signed POST URLs; null when the payload has no such button or no secret/base URL is set. */
  doneUrl: string | null;
  snoozeUrl: string | null;
};

/**
 * The next reminders (strictly after `now`, nearest first) of every enabled task, computed with
 * the engine's plan — nothing is read from or written to the outbox. Action URLs stay valid for
 * 24 h after the reminder is due.
 */
export async function listUpcomingReminders(input: {
  now: Date;
  limit: number;
  baseUrl: string;
}): Promise<UpcomingReminder[]> {
  const { now, limit, baseUrl } = input;
  const db = await getDb();
  const [settings, taskRows, stateRows] = await Promise.all([
    getSettings(db),
    db.select().from(schema.tasks),
    db.select().from(schema.taskState),
  ]);
  const states = new Map(stateRows.map((row) => [row.taskId, row]));
  const secret = getActionSecret();

  const reminders: UpcomingReminder[] = [];
  for (const row of taskRows) {
    const task = buildTask(row);
    const stateRow = states.get(task.id);
    const state: EngineTaskState = stateRow
      ? {
          timerStartedAt: stateRow.timerStartedAt,
          timerEndsAt: stateRow.timerEndsAt,
          lastDoneAt: stateRow.lastDoneAt,
          lastAckDate: stateRow.lastAckDate,
          snoozedUntil: stateRow.snoozedUntil,
        }
      : { ...EMPTY_TASK_STATE };
    for (const planned of buildDesiredNotifications(task, state, {
      now,
      settings,
    })) {
      if (planned.dueAt.getTime() <= now.getTime()) continue;
      const occurrence = readOccurrenceFromKey(planned.key);
      const expiresAt = new Date(planned.dueAt.getTime() + ACTION_TOKEN_TTL_MS);
      const sign = (action: "done" | "snooze") =>
        secret && occurrence && planned.payload.actions.includes(action)
          ? createActionUrl({
              baseUrl,
              action,
              taskId: task.id,
              occurrence,
              expiresAt,
              secret,
            })
          : null;
      reminders.push({
        id: planned.key,
        taskId: task.id,
        taskName: task.name,
        title: planned.payload.title,
        message: planned.payload.message,
        priority: planned.payload.priority,
        dueAt: planned.dueAt.toISOString(),
        doneUrl: sign("done"),
        snoozeUrl: sign("snooze"),
      });
    }
  }
  return reminders
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, limit);
}
