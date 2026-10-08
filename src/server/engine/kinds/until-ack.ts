import { isUntilAckDay } from "@/shared/schedule";
import type { UntilAckConfig } from "@/shared/tasks";
import { addLocalDays, createLocalInstant, getLocalDate, type LocalDate } from "@/shared/time";
import { buildNotificationKey } from "../keys";
import { formatLocalDateLabel, getEndOfLocalDay } from "../time";
import type { EngineTaskState, KindHandler, PlannedNotification, TaskOf, TaskOutcome } from "./types";

type UntilAckTask = TaskOf<"until_ack">;

/** How far ahead to look for the next scheduled day. */
const MAX_LOOKAHEAD_DAYS = 400;

/** First scheduled day strictly after `after`, or null if none within ~a year. */
export function getNextUntilAckDate(config: UntilAckConfig, after: LocalDate): LocalDate | null {
  for (let offset = 1; offset <= MAX_LOOKAHEAD_DAYS; offset++) {
    const date = addLocalDays(after, offset);
    if (isUntilAckDay(config, date)) return date;
  }
  return null;
}

/** ntfy priority for the i-th of n reminders of a day: 3 → 5 as the day goes on. */
export function getEscalationPriority(index: number, count: number): number {
  if (count <= 1) return 4;
  return 3 + Math.round((2 * index) / (count - 1));
}

function describeNextDate(config: UntilAckConfig, today: LocalDate): string {
  const next = getNextUntilAckDate(config, today);
  return next ? `Próxima vez: ${formatLocalDateLabel(next)}.` : "Sem mais dias marcados.";
}

function buildDayReminders(task: UntilAckTask, date: LocalDate): PlannedNotification[] {
  const times = task.config.reminderTimes;
  const expiresAt = getEndOfLocalDay(date);
  return times.map((time, index) => {
    const isFirst = index === 0;
    const isLast = index === times.length - 1;
    const message = isFirst
      ? "Hoje é o dia. Toca na tag quando estiver feito."
      : isLast
        ? "Último aviso de hoje — ainda não está feito!"
        : `Ainda não está feito (aviso ${index + 1} de ${times.length}).`;
    return {
      key: buildNotificationKey("until_ack", task.id, date, time),
      kind: "until_ack_reminder",
      dueAt: createLocalInstant(date, time),
      expiresAt,
      payload: {
        title: task.name,
        message,
        priority: getEscalationPriority(index, times.length),
        tags: isLast ? ["rotating_light"] : ["bell"],
        actions: ["done", "snooze", "open"],
      },
    };
  });
}

function acknowledgeToday(task: UntilAckTask, state: EngineTaskState, now: Date): TaskOutcome {
  const today = getLocalDate(now);
  if (!isUntilAckDay(task.config, today)) {
    return {
      patch: {},
      events: [],
      result: { title: task.name, message: `Hoje não é dia. ${describeNextDate(task.config, today)}`, tone: "info" },
    };
  }
  if (state.lastAckDate === today) {
    return {
      patch: {},
      events: [],
      result: { title: task.name, message: `Já estava feito hoje. ${describeNextDate(task.config, today)}`, tone: "info" },
    };
  }
  return {
    patch: { lastAckDate: today, snoozedUntil: null },
    events: [{ type: "acked", data: { date: today } }],
    result: { title: task.name, message: `Feito por hoje. ${describeNextDate(task.config, today)}`, tone: "done" },
  };
}

export const untilAckHandler: KindHandler<"until_ack"> = {
  planNotifications(task, state, { now }) {
    const today = getLocalDate(now);
    const days = [today, getNextUntilAckDate(task.config, today)].filter(
      (date): date is LocalDate =>
        date !== null && isUntilAckDay(task.config, date) && state.lastAckDate !== date,
    );
    return days.flatMap((date) => buildDayReminders(task, date));
  },
  /** Alerts belong to a local day; only today's can be acted on. */
  getCurrentOccurrence: (_task, _state, now) => getLocalDate(now),
  handleScan: acknowledgeToday,
  handleDone: acknowledgeToday,
};
