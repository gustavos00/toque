// Pure rules: which Google Calendar events a task should have right now.
import { createHash } from "node:crypto";
import type { EngineTaskState } from "@/server/engine/kinds/types";
import {
  getNextRecurringOccurrence,
  getRecurringDueAt,
  getTimerPhase,
  isUntilAckDay,
} from "@/shared/schedule";
import type { Task } from "@/shared/tasks";
import {
  addLocalDays,
  createLocalInstant,
  getLocalDate,
  TIMEZONE,
} from "@/shared/time";

/** Rolling horizon for until_ack / recurring events, starting today. */
export const CALENDAR_HORIZON_DAYS = 28;
/** Length of until_ack / recurring events (timed, so they show at the alert time). */
export const CALENDAR_EVENT_MINUTES = 30;
/** Safety cap on generated occurrences per task. */
const MAX_OCCURRENCES = 64;

/** Body sent to Calendar v3 events.insert / events.update. */
export type CalendarEventBody = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: false; overrides: [] };
  extendedProperties: { private: Record<string, string> };
};

/** One event the calendar should contain. `occurrenceKey` is unique per task. */
export type DesiredCalendarEvent = {
  occurrenceKey: string;
  start: Date;
  end: Date;
  body: CalendarEventBody;
  /** sha256 of the body; an event is only updated when this changes. */
  hash: string;
};

function buildEvent(
  task: Task,
  occurrenceKey: string,
  start: Date,
  end: Date,
  description: string,
): DesiredCalendarEvent {
  const body: CalendarEventBody = {
    summary: task.name,
    description,
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    // User decision: the calendar never notifies; ntfy does.
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: {
      private: { toqueTaskId: task.id, toqueOccurrence: occurrenceKey },
    },
  };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { occurrenceKey, start, end, body, hash };
}

function buildShortEvent(
  task: Task,
  occurrenceKey: string,
  start: Date,
  description: string,
) {
  return buildEvent(
    task,
    occurrenceKey,
    start,
    new Date(start.getTime() + CALENDAR_EVENT_MINUTES * 60_000),
    description,
  );
}

/**
 * Missed rubbish days stay in the calendar as history: a live until_ack event for a day before
 * today is never deleted by the sync (acked days were deleted on their own day). Everything
 * else that is no longer desired is deleted; a disabled or deleted task loses all its events.
 */
export function isPastEventKept(
  task: Task | null,
  occurrenceKey: string,
  now: Date,
): boolean {
  if (!task?.enabled || task.kind !== "until_ack") return false;
  return occurrenceKey.slice("until_ack:".length) < getLocalDate(now);
}

/**
 * - timer: one event startedAt → endsAt while running or ready ("por tratar"); gone once handled.
 *   A new start has a new key, so it replaces the old event.
 * - until_ack: each scheduled day from today through the horizon, at the first reminder time,
 *   30 min; today's disappears once acked. Exception dates never have one.
 * - recurring: the current occurrence (kept while overdue) plus the following ones inside the
 *   horizon, at reminderTime, 30 min; an occurrence's event disappears once it is done.
 *   Interval mode projects later occurrences as if each were done on its due day.
 * - disabled task: none.
 */
export function buildDesiredCalendarEvents(
  task: Task,
  state: EngineTaskState,
  now: Date,
): DesiredCalendarEvent[] {
  if (!task.enabled) return [];
  const today = getLocalDate(now);
  const horizonEnd = createLocalInstant(
    addLocalDays(today, CALENDAR_HORIZON_DAYS),
    "00:00",
  );

  switch (task.kind) {
    case "timer": {
      const { timerStartedAt: startedAt, timerEndsAt: endsAt } = state;
      const phase = getTimerPhase(state, now);
      if (!startedAt || !endsAt || (phase !== "running" && phase !== "ready"))
        return [];
      return [
        buildEvent(
          task,
          `timer:${startedAt.getTime()}`,
          startedAt,
          endsAt,
          "A decorrer (Toque).",
        ),
      ];
    }

    case "until_ack": {
      const firstTime = task.config.reminderTimes[0];
      const events: DesiredCalendarEvent[] = [];
      for (let offset = 0; offset < CALENDAR_HORIZON_DAYS; offset++) {
        const date = addLocalDays(today, offset);
        if (!isUntilAckDay(task.config, date) || state.lastAckDate === date)
          continue;
        events.push(
          buildShortEvent(
            task,
            `until_ack:${date}`,
            createLocalInstant(date, firstTime),
            "Toca na tag quando estiver feito (Toque).",
          ),
        );
      }
      return events;
    }

    case "recurring": {
      const history = {
        lastDoneAt: state.lastDoneAt,
        createdAt: task.createdAt,
      };
      const events: DesiredCalendarEvent[] = [];
      let occurrence = getRecurringDueAt(task.config, history, now);
      for (let i = 0; i < MAX_OCCURRENCES && occurrence < horizonEnd; i++) {
        events.push(
          buildShortEvent(
            task,
            `recurring:${getLocalDate(occurrence)}`,
            occurrence,
            "Toca na tag quando estiver feito (Toque).",
          ),
        );
        occurrence = getNextRecurringOccurrence(
          task.config,
          history,
          occurrence,
        );
      }
      return events;
    }

    default:
      return [];
  }
}
