import type { EventDto } from "../../src/shared/api";

// The household lives in Lisbon: show its clock whatever the phone is set to.
const LOCALE = "en-GB";
const TIME_ZONE = "Europe/Lisbon";

const EVENT_LABELS: Record<string, string> = {
  scan: "Tag tapped",
  task_created: "Task created",
  task_updated: "Task changed",
  task_deleted: "Task deleted",
  timer_started: "Started",
  timer_finished: "Finished",
  timer_cancelled: "Cancelled",
  acked: "Done",
  done: "Done",
  snoozed: "Snoozed",
  notification_sent: "Reminder sent",
  notification_failed: "Reminder failed",
};

export const KIND_LABELS = {
  timer: "Timer",
  until_ack: "Until done",
  recurring: "Recurring",
} as const;

export const KIND_PLURALS = {
  timer: "Timers",
  until_ack: "Until done",
  recurring: "Recurring",
} as const;

export const KIND_PLACEHOLDERS = {
  timer: "e.g. Washing machine",
  until_ack: "e.g. Take out the bins",
  recurring: "e.g. Water the plants",
} as const;

export const KIND_DESCRIPTIONS = {
  timer:
    "Tapping the tag starts a countdown. You get a reminder when it ends, and again if it is left unattended.",
  until_ack:
    "On the chosen days, reminders arrive at set times until the tag is tapped that day.",
  recurring:
    "On set weekdays or every N days. Tapping the tag marks it done; it becomes overdue after the due time.",
} as const;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 7) return "Every day";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d)))
    return "Weekdays";
  if (weekdays.length === 2 && weekdays.includes(6) && weekdays.includes(7))
    return "Weekends";
  return weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

export const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatEventType(event: EventDto): string {
  return EVENT_LABELS[event.type] ?? event.type;
}

export function formatEventSubject(event: EventDto): string {
  if (event.taskName) return event.taskName;
  if (event.type === "task_deleted" && typeof event.data.name === "string")
    return event.data.name;
  return event.type === "scan" ? "Tag with no task" : "Toque";
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/** Lisbon calendar day of `date`, as YYYY-MM-DD, for "is it today" checks. */
export function formatDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** "14:05" today, "Mon 2 Nov, 14:05" on other days. */
export function formatDayTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (formatDayKey(date) === formatDayKey(now)) return formatTime(iso);
  const day = date
    .toLocaleDateString(LOCALE, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: TIME_ZONE,
    })
    .replace(",", "");
  return `${day}, ${formatTime(iso)}`;
}

export function formatWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "long",
    timeZone: TIME_ZONE,
  });
}

/** "Tuesday 3 November". */
export function formatLongToday(now: Date): string {
  return now
    .toLocaleDateString(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: TIME_ZONE,
    })
    .replace(",", "");
}

/** "1:02:03" / "12:34" remaining time for a running timer. */
export function formatRemaining(endsAt: string, now: Date): string {
  const total = Math.max(0, Math.round((new Date(endsAt).getTime() - now.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "2 tags" / "No tags". */
export function formatTagCount(count: number): string {
  if (count === 0) return "No tags";
  return count === 1 ? "1 tag" : `${count} tags`;
}
