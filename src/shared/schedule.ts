// Pure schedule rules shared by the engine and the dashboard, so both agree
// on what "due today" and "overdue" mean.

import type { RecurringConfig, UntilAckConfig } from "./tasks";
import {
  addLocalDays,
  createLocalInstant,
  getIsoWeekday,
  getLocalDate,
  type LocalDate,
} from "./time";

/**
 * Where a timer task is in its cycle, from task_state:
 * - idle: never run (no cycle, never done)
 * - running: now < timerEndsAt
 * - ready: ended and not handled since ("Pronta · por estender")
 * - handled: lastDoneAt >= timerEndsAt, or the cycle was cleared after being
 *   done ("Tratada")
 * Works whether the engine clears timerStartedAt/timerEndsAt on "done" or
 * keeps them and only sets lastDoneAt.
 */
export type TimerPhase = "idle" | "running" | "ready" | "handled";

export function getTimerPhase(
  state:
    { timerEndsAt: Date | null; lastDoneAt: Date | null } | null | undefined,
  now: Date,
): TimerPhase {
  const endsAt = state?.timerEndsAt ?? null;
  const lastDoneAt = state?.lastDoneAt ?? null;
  if (!endsAt) return lastDoneAt ? "handled" : "idle";
  if (now < endsAt) return "running";
  return lastDoneAt && lastDoneAt >= endsAt ? "handled" : "ready";
}

/** Is `date` (local) a day on which an until_ack task must be acknowledged? */
export function isUntilAckDay(
  config: UntilAckConfig,
  date: LocalDate,
): boolean {
  if (config.exceptDates.includes(date)) return false;
  return (
    config.dates.includes(date) || config.weekdays.includes(getIsoWeekday(date))
  );
}

/** What the recurring rules need from a task and its state. */
export type RecurringHistory = {
  /** task_state.lastDoneAt (null = never done). */
  lastDoneAt: Date | null;
  /** tasks.createdAt. */
  createdAt: Date;
};

/**
 * The moment the current (still undone) occurrence of a recurring task is
 * due. It is overdue whenever `now >= dueAt`, and stays so until a scan
 * (lastDoneAt moves forward), however many occurrences are missed.
 *
 * - interval: `everyDays` local days after the day it was last done, at
 *   `reminderTime`. Never done → the day it was created.
 * - weekdays: an occurrence is each selected weekday at `reminderTime`. A scan
 *   at any time on a day covers that day's occurrence (even before the
 *   reminder time) and every earlier one. Never done → occurrences from the
 *   creation instant on. If some uncovered occurrences have already passed,
 *   the most recent of them is returned (missed days collapse into one);
 *   otherwise the next upcoming one.
 */
export function getRecurringDueAt(
  config: RecurringConfig,
  history: RecurringHistory,
  now: Date,
): Date {
  const { lastDoneAt, createdAt } = history;
  if (config.mode === "interval") {
    const dueDate = lastDoneAt
      ? addLocalDays(getLocalDate(lastDoneAt), config.everyDays)
      : getLocalDate(createdAt);
    return createLocalInstant(dueDate, config.reminderTime);
  }

  // First local day whose occurrence is not covered yet.
  const firstDate = lastDoneAt
    ? addLocalDays(getLocalDate(lastDoneAt), 1)
    : getLocalDate(createdAt);
  // Only the last week can hold the most recent missed occurrence.
  const weekAgo = addLocalDays(getLocalDate(now), -7);
  let date = firstDate < weekAgo ? weekAgo : firstDate;
  let latestPassed: Date | null = null;
  // 15 days always reach an upcoming occurrence (≥ 1 weekday per week).
  // The date advances at the top of the body, not in the for-update clause:
  // Turbopack drops the imported addLocalDays binding there (ReferenceError).
  for (let step = 0; step < 15; step += 1) {
    if (step > 0) date = addLocalDays(date, 1);
    if (!config.weekdays.includes(getIsoWeekday(date))) continue;
    const occurrence = createLocalInstant(date, config.reminderTime);
    if (!lastDoneAt && occurrence < createdAt) continue;
    if (occurrence <= now) {
      latestPassed = occurrence;
      continue;
    }
    return latestPassed ?? occurrence;
  }
  if (latestPassed) return latestPassed;
  throw new Error("recurring weekdays config without weekdays");
}

/**
 * When the task would be due next if it were done now — what the UI shows as
 * "próxima: terça". Equals getRecurringDueAt after a scan at `now`.
 */
export function getNextRecurringOccurrence(
  config: RecurringConfig,
  history: RecurringHistory,
  now: Date,
): Date {
  return getRecurringDueAt(config, { ...history, lastDoneAt: now }, now);
}
