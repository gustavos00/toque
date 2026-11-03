// Engine-only time helpers. The base conversions live in @/shared/time so the
// engine and the dashboard agree on every local date/time.
import {
  addLocalDays,
  createLocalInstant,
  getIsoWeekday,
  type LocalDate,
  type LocalTime,
} from "@/shared/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Minutes since local midnight for a "HH:MM" string. */
export function getMinutesOfDay(time: LocalTime): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** First instant of the local day after `date` — the end of `date`. */
export function getEndOfLocalDay(date: LocalDate): Date {
  return createLocalInstant(addLocalDays(date, 1), "00:00");
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function getLocalDaysBetween(from: LocalDate, to: LocalDate): number {
  const toUtc = (date: LocalDate) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** "Thu, 15/10" — short English label for a local date (weekday, day/month). */
export function formatLocalDateLabel(date: LocalDate): string {
  const [, month, day] = date.split("-");
  return `${WEEKDAY_LABELS[getIsoWeekday(date) - 1]}, ${day}/${month}`;
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}
