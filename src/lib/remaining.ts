// "How much time is left" for each task kind, in European Portuguese.
// Pure functions of (task data, now) so the UI can re-run them every second
// and the timer can flip from running to ready without a refetch.

import {
  addLocalDays,
  createLocalInstant,
  getLocalDate,
  getLocalTime,
  getRecurringDueAt,
  getTimerPhase,
  isUntilAckDay,
  type LocalDate,
  type RecurringConfig,
  type TaskDto,
  type TimerConfig,
  type TimerPhase,
  type UntilAckConfig,
} from "@/shared";
import { getWeekdayName } from "./weekdays";

const MINUTE = 60_000;
const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

type Tone = "active" | "warning" | "danger" | "success" | "neutral";

/** Text colour per tone (Tailwind classes). */
export const TONE_TEXT: Record<Tone, string> = {
  active: "text-kind-timer",
  warning: "text-warning",
  danger: "text-destructive",
  success: "text-success",
  neutral: "text-foreground",
};

type RemainingSummary = {
  /** Main line, e.g. "faltam 42 min" or "Atrasada há 1 dia". */
  headline: string;
  /** Secondary line, e.g. "acaba às 15:40". */
  detail: string | null;
  /** Compact text for the right side of a list row. */
  short: string;
  tone: Tone;
};

export type TimerSummary = RemainingSummary & {
  phase: TimerPhase;
  /** 0…1 from start to end while running. */
  progress: number | null;
  /** 0…1 position of the "almost done" heads-up on the bar, if enabled. */
  almostDoneMark: number | null;
};

// ---------- Durations ----------

/** "menos de 1 min", "42 min", "2 h 10 min", "3 h" (rounded up to the minute). */
export function formatDurationLeft(ms: number) {
  const totalMinutes = Math.ceil(Math.max(0, ms) / MINUTE);
  if (totalMinutes < 1) return "menos de 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "faltam 42 min", "falta 1 min", "falta menos de 1 min". */
export function formatTimeLeft(ms: number) {
  const totalMinutes = Math.ceil(Math.max(0, ms) / MINUTE);
  const isSingular = totalMinutes <= 1;
  return `${isSingular ? "falta" : "faltam"} ${formatDurationLeft(ms)}`;
}

/** Compact relative time for the future: "daqui a 5 min", "daqui a 1 h 20", "daqui a 2 h". */
export function formatFromNow(target: Date, now: Date) {
  const totalMinutes = Math.ceil(Math.max(0, target.getTime() - now.getTime()) / MINUTE);
  if (totalMinutes < 1) return "agora";
  if (totalMinutes < 60) return `daqui a ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `daqui a ${hours} h` : `daqui a ${hours} h ${String(minutes).padStart(2, "0")}`;
}

/** Whole calendar days from `from` to `to` (local dates). */
export function countLocalDays(from: LocalDate, to: LocalDate) {
  const toUtc = (date: LocalDate) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / (24 * 60 * MINUTE));
}

function pluralizeDays(days: number) {
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** "amanhã", "terça" (within a week) or "25/12". */
function formatDayName(date: LocalDate, today: LocalDate) {
  const days = countLocalDays(today, date);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days < 7) {
    const [year, month, day] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return WEEKDAY_NAMES[(weekday + 6) % 7];
  }
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

// ---------- Timer ----------

type TimerConfigWithAlerts = TimerConfig & Partial<{ almostDoneEnabled: boolean; almostDoneMinutes: number }>;

export function getTimerSummary(
  config: TimerConfigWithAlerts,
  state: { startedAt: string | null; endsAt: string | null; handledAt: string | null },
  now: Date,
): TimerSummary {
  const endsAt = state.endsAt ? new Date(state.endsAt) : null;
  const handledAt = state.handledAt ? new Date(state.handledAt) : null;
  const phase = getTimerPhase({ timerEndsAt: endsAt, lastDoneAt: handledAt }, now);

  if (phase === "running" && endsAt) {
    const startedAt = state.startedAt
      ? new Date(state.startedAt)
      : new Date(endsAt.getTime() - config.durationMinutes * MINUTE);
    const total = Math.max(1, endsAt.getTime() - startedAt.getTime());
    const left = endsAt.getTime() - now.getTime();
    const almostDoneMark =
      config.almostDoneEnabled && config.almostDoneMinutes
        ? Math.min(1, Math.max(0, 1 - (config.almostDoneMinutes * MINUTE) / total))
        : null;
    return {
      phase,
      headline: formatTimeLeft(left),
      detail: `acaba às ${getLocalTime(endsAt)}`,
      short: formatTimeLeft(left),
      tone: "active",
      progress: Math.min(1, Math.max(0, (now.getTime() - startedAt.getTime()) / total)),
      almostDoneMark,
    };
  }
  if (phase === "ready") {
    return {
      phase,
      headline: "Pronta · por estender",
      detail: endsAt ? `acabou às ${getLocalTime(endsAt)}` : null,
      short: "Pronta",
      tone: "warning",
      progress: 1,
      almostDoneMark: null,
    };
  }
  if (phase === "handled" && handledAt) {
    const isToday = getLocalDate(handledAt) === getLocalDate(now);
    const when = isToday ? `às ${getLocalTime(handledAt)}` : `${formatDayName(getLocalDate(handledAt), getLocalDate(now))} às ${getLocalTime(handledAt)}`;
    return {
      phase,
      headline: `Tratada ${when}`,
      detail: null,
      short: isToday ? `Tratada às ${getLocalTime(handledAt)}` : "Tratada",
      tone: "success",
      progress: null,
      almostDoneMark: null,
    };
  }
  return {
    phase,
    headline: "Parada",
    detail: `Dura ${formatDurationLeft(config.durationMinutes * MINUTE)}`,
    short: "Parada",
    tone: "neutral",
    progress: null,
    almostDoneMark: null,
  };
}

// ---------- until_ack ----------

/** First scheduled local date strictly after `today`, within a year. */
function findNextUntilAckDay(config: UntilAckConfig, today: LocalDate) {
  for (let offset = 1; offset <= 366; offset += 1) {
    const date = addLocalDays(today, offset);
    if (isUntilAckDay(config, date)) return date;
  }
  return null;
}

export function getUntilAckSummary(
  config: UntilAckConfig,
  state: { lastAckDate: LocalDate | null; snoozedUntil: string | null } | null,
  now: Date,
): RemainingSummary {
  const today = getLocalDate(now);
  const isDueToday = isUntilAckDay(config, today);

  if (isDueToday && state?.lastAckDate !== today) {
    const snoozedUntil = state?.snoozedUntil ? new Date(state.snoozedUntil) : null;
    const nextTime =
      snoozedUntil && snoozedUntil > now
        ? snoozedUntil
        : config.reminderTimes
            .map((time) => createLocalInstant(today, time))
            .find((instant) => instant.getTime() > now.getTime());
    if (!nextTime) {
      return { headline: "Por fazer", detail: "sem mais avisos hoje", short: "Por fazer", tone: "warning" };
    }
    const time = getLocalTime(nextTime);
    return {
      headline: "Por fazer",
      detail: `próximo aviso às ${time} (${formatFromNow(nextTime, now)})`,
      short: `aviso às ${time}`,
      tone: "warning",
    };
  }

  const nextDay = findNextUntilAckDay(config, today);
  const isDoneToday = isDueToday && state?.lastAckDate === today;
  if (!nextDay) {
    return {
      headline: isDoneToday ? "Feito hoje" : "Sem dias marcados",
      detail: null,
      short: isDoneToday ? "Feito" : "—",
      tone: isDoneToday ? "success" : "neutral",
    };
  }
  const days = countLocalDays(today, nextDay);
  const next = `Próxima recolha: ${formatDayName(nextDay, today)}${days > 1 ? ` (daqui a ${pluralizeDays(days)})` : ""}`;
  return {
    headline: isDoneToday ? "Feito hoje" : next,
    detail: isDoneToday ? next : null,
    short: isDoneToday ? "Feito" : formatDayName(nextDay, today),
    tone: isDoneToday ? "success" : "neutral",
  };
}

// ---------- recurring ----------

export function getRecurringSummary(
  config: RecurringConfig,
  lastDoneAt: string | null,
  createdAt: string,
  now: Date,
): RemainingSummary & { dueAt: Date; isOverdue: boolean } {
  const dueAt = getRecurringDueAt(
    config,
    { lastDoneAt: lastDoneAt ? new Date(lastDoneAt) : null, createdAt: new Date(createdAt) },
    now,
  );
  const today = getLocalDate(now);
  const dueDate = getLocalDate(dueAt);
  const isOverdue = now.getTime() >= dueAt.getTime();
  const daysLate = countLocalDays(dueDate, today);

  if (isOverdue) {
    let text: string;
    if (daysLate < 1) text = `Atrasada há ${formatDurationLeft(now.getTime() - dueAt.getTime())}`;
    else if (config.mode === "weekdays" && daysLate < 7) text = `Atrasada desde ${daysLate === 1 ? "ontem" : getWeekdayName(dueDate)}`;
    else text = `Atrasada há ${pluralizeDays(daysLate)}`;
    return {
      headline: text,
      detail: `era para ${formatDayName(dueDate, today)} às ${config.reminderTime}`,
      short: text,
      tone: "danger",
      dueAt,
      isOverdue,
    };
  }

  const daysLeft = countLocalDays(today, dueDate);
  const capitalizedDay = formatDayName(dueDate, today).replace(/^./, (letter) => letter.toUpperCase());

  if (config.mode === "weekdays") {
    if (daysLeft === 0) {
      return { headline: "Hoje", detail: `às ${config.reminderTime}`, short: "Hoje", tone: "warning", dueAt, isOverdue };
    }
    const dayName = formatDayName(dueDate, today);
    const text = `Próxima: ${dayName}${daysLeft > 1 ? ` (daqui a ${pluralizeDays(daysLeft)})` : ""}`;
    return { headline: text, detail: `às ${config.reminderTime}`, short: capitalizedDay, tone: "neutral", dueAt, isOverdue };
  }

  const text =
    daysLeft >= 1
      ? `${daysLeft === 1 ? "Falta" : "Faltam"} ${pluralizeDays(daysLeft)}`
      : formatTimeLeft(dueAt.getTime() - now.getTime()).replace(/^f/, "F");
  return {
    headline: text,
    detail: `${capitalizedDay} às ${config.reminderTime}`,
    short: text,
    tone: daysLeft === 0 ? "warning" : "neutral",
    dueAt,
    isOverdue,
  };
}

// ---------- Any task ----------

/** One-line summary for the Tarefas list (right-hand side). */
export function getTaskRemaining(task: TaskDto, now: Date): RemainingSummary {
  if (!task.enabled) return { headline: "Desativada", detail: null, short: "", tone: "neutral" };
  switch (task.kind) {
    case "timer":
      return getTimerSummary(
        task.config,
        {
          startedAt: task.state?.timerStartedAt ?? null,
          endsAt: task.state?.timerEndsAt ?? null,
          handledAt: task.state?.lastDoneAt ?? null,
        },
        now,
      );
    case "until_ack":
      return getUntilAckSummary(task.config, task.state, now);
    case "recurring":
      return getRecurringSummary(task.config, task.state?.lastDoneAt ?? null, task.createdAt, now);
  }
}
