// Portuguese (pt-PT) formatting pinned to Europe/Lisbon.

import { addLocalDays, getLocalDate, TIMEZONE, type EventDto, type LocalDate } from "@/shared";

const LOCALE = "pt-PT";

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const localDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const longTodayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value;
}

/** "15:40" */
export function formatTime(value: Date | string) {
  return timeFormatter.format(toDate(value));
}

/** "hoje", "amanhã", "ontem" or "sex., 9 out." */
export function formatDay(value: Date | string, now = new Date()) {
  const date = getLocalDate(toDate(value));
  const today = getLocalDate(now);
  if (date === today) return "hoje";
  if (date === addLocalDays(today, 1)) return "amanhã";
  if (date === addLocalDays(today, -1)) return "ontem";
  return shortDateFormatter.format(toDate(value));
}

/** "hoje às 15:40", "ontem às 09:12", "sex., 9 out. às 10:00" */
export function formatDayTime(value: Date | string, now = new Date()) {
  return `${formatDay(value, now)} às ${formatTime(value)}`;
}

/** "sexta-feira, 9 de outubro" */
export function formatLongToday(now = new Date()) {
  return longTodayFormatter.format(now);
}

/** A "YYYY-MM-DD" local date as "sex., 25 dez. 2026". */
export function formatLocalDate(date: LocalDate) {
  const [year, month, day] = date.split("-").map(Number);
  return localDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

/** "1 h 35 min", "45 min", "2 h" */
export function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Countdown clock: "42:05" or "1:02:05". */
export function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** "a cada dia", "a cada 3 dias" */
export function formatEveryDays(everyDays: number) {
  return everyDays === 1 ? "todos os dias" : `a cada ${everyDays} dias`;
}

/** "há 5 min", "há 3 h", "há 2 dias", "em 4 dias" */
export function formatRelative(value: Date | string, now = new Date()) {
  const diffMs = toDate(value).getTime() - now.getTime();
  const future = diffMs > 0;
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  let amount: string;
  if (minutes < 1) return "agora";
  if (minutes < 60) amount = `${minutes} min`;
  else if (minutes < 60 * 24) amount = `${Math.round(minutes / 60)} h`;
  else {
    const days = Math.round(minutes / (60 * 24));
    amount = days === 1 ? "1 dia" : `${days} dias`;
  }
  return future ? `em ${amount}` : `há ${amount}`;
}

const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** ISO weekdays as "seg, qua, sex" or "todos os dias" / "dias úteis". */
export function formatWeekdays(weekdays: number[]) {
  if (weekdays.length === 7) return "todos os dias";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((day) => weekdays.includes(day))) return "dias úteis";
  if (weekdays.length === 2 && weekdays.includes(6) && weekdays.includes(7)) return "fins de semana";
  return weekdays.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
}

const EVENT_LABELS: Record<string, string> = {
  scan: "Tag lida",
  task_created: "Tarefa criada",
  task_updated: "Tarefa alterada",
  task_deleted: "Tarefa apagada",
  timer_started: "Começou",
  timer_finished: "Terminou",
  timer_cancelled: "Cancelado",
  acked: "Feito",
  done: "Feito",
  snoozed: "Adiado",
  notification_sent: "Aviso enviado",
  notification_failed: "Aviso falhou",
};

/** "Começou", "Feito", … */
export function formatEventType(event: EventDto) {
  return EVENT_LABELS[event.type] ?? event.type;
}

/** The task name, or a fallback for events without one. */
export function formatEventSubject(event: EventDto) {
  if (event.taskName) return event.taskName;
  if (event.type === "task_deleted" && typeof event.data.name === "string") return event.data.name;
  return event.type === "scan" ? "Tag sem tarefa" : "Toque";
}
