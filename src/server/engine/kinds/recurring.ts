import {
  getNextRecurringOccurrence,
  getRecurringDueAt,
} from "@/shared/schedule";
import type { RecurringConfig } from "@/shared/tasks";
import {
  addLocalDays,
  createLocalInstant,
  getIsoWeekday,
  getLocalDate,
  type LocalDate,
} from "@/shared/time";
import { buildNotificationKey } from "../keys";
import { formatLocalDateLabel, getLocalDaysBetween } from "../time";
import type {
  KindHandler,
  PlannedNotification,
  TaskOf,
  TaskOutcome,
} from "./types";

type RecurringTask = TaskOf<"recurring">;

function describeSchedule(config: RecurringConfig): string {
  if (config.mode === "weekdays") return "Hoje é dia";
  return config.everyDays === 1
    ? "Está na hora (todos os dias)"
    : `Está na hora (a cada ${config.everyDays} dias)`;
}

/** Is `date` itself an occurrence (weekdays mode)? Such a day gets a "due" row, not an overdue one. */
function isOccurrenceDay(config: RecurringConfig, date: LocalDate): boolean {
  return (
    config.mode === "weekdays" && config.weekdays.includes(getIsoWeekday(date))
  );
}

function buildDueRow(
  task: RecurringTask,
  date: LocalDate,
): PlannedNotification {
  return {
    key: buildNotificationKey("recurring", task.id, date, "due"),
    kind: "recurring_due",
    dueAt: createLocalInstant(date, task.config.reminderTime),
    expiresAt: null,
    payload: {
      title: task.name,
      message: `${describeSchedule(task.config)}. Toca na tag quando estiver feito.`,
      priority: 3,
      tags: ["calendar"],
      actions: ["done", "snooze", "open"],
    },
  };
}

function completeTask(task: RecurringTask, now: Date): TaskOutcome {
  const nextDue = getNextRecurringOccurrence(
    task.config,
    { lastDoneAt: now, createdAt: task.createdAt },
    now,
  );
  return {
    patch: { lastDoneAt: now, snoozedUntil: null },
    events: [{ type: "done" }],
    result: {
      title: task.name,
      message: `Feito. Próxima vez: ${formatLocalDateLabel(getLocalDate(nextDue))}.`,
      tone: "done",
    },
  };
}

export const recurringHandler: KindHandler<"recurring"> = {
  /**
   * The current occurrence (shared getRecurringDueAt, both modes; missed weekday occurrences
   * collapse into the latest one) gets a "recurring_due" at `reminderTime` on its day, then one
   * "recurring_overdue" per day at the same time until done — never one per missed day.
   * Keys carry the occurrence date, so a schedule change never collides with old rows.
   * Only today's and tomorrow's rows are planned; ticks roll it forward.
   */
  planNotifications(task, state, { now }) {
    const dueAt = getRecurringDueAt(
      task.config,
      { lastDoneAt: state.lastDoneAt, createdAt: task.createdAt },
      now,
    );
    const dueDate = getLocalDate(dueAt);
    const today = getLocalDate(now);
    const rows: PlannedNotification[] = [];

    if (dueDate >= today) rows.push(buildDueRow(task, dueDate));

    for (const date of [today, addLocalDays(today, 1)]) {
      const daysLate = getLocalDaysBetween(dueDate, date);
      if (daysLate < 1) continue;
      // A later selected weekday becomes the new occurrence that day: plan its "due" row instead.
      if (isOccurrenceDay(task.config, date)) {
        rows.push(buildDueRow(task, date));
        continue;
      }
      rows.push({
        key: buildNotificationKey(
          "recurring",
          task.id,
          dueDate,
          "overdue",
          date,
        ),
        kind: "recurring_overdue",
        dueAt: createLocalInstant(date, task.config.reminderTime),
        expiresAt: null,
        payload: {
          title: `${task.name}: em atraso`,
          message: `Era para ${formatLocalDateLabel(dueDate)} — ${daysLate === 1 ? "há 1 dia" : `há ${daysLate} dias`}.`,
          priority: 4,
          tags: ["hourglass"],
          actions: ["done", "snooze", "open"],
        },
      });
    }
    return rows;
  },

  /** The occurrence is the local date of the current (undone) due occurrence. */
  getCurrentOccurrence: (task, state, now) =>
    getLocalDate(
      getRecurringDueAt(
        task.config,
        { lastDoneAt: state.lastDoneAt, createdAt: task.createdAt },
        now,
      ),
    ),
  handleScan: (task, _state, now) => completeTask(task, now),
  handleDone: (task, _state, now) => completeTask(task, now),
};
