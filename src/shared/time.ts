// Time helpers pinned to the app's timezone. All "local" values are in
// Europe/Lisbon; all instants are plain `Date`s (UTC under the hood).

export const TIMEZONE = "Europe/Lisbon";

/** "YYYY-MM-DD" in local time. */
export type LocalDate = string;
/** "HH:MM" (24h) in local time. */
export type LocalTime = string;

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getLocalParts(at: Date) {
  const parts: Record<string, string> = {};
  for (const part of datePartsFormatter.formatToParts(at))
    parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

/** Local calendar date of an instant, e.g. "2026-10-09". */
export function getLocalDate(at: Date): LocalDate {
  const { year, month, day } = getLocalParts(at);
  return `${year}-${padTwo(month)}-${padTwo(day)}`;
}

/** Local wall-clock time of an instant, e.g. "15:40". */
export function getLocalTime(at: Date): LocalTime {
  const { hour, minute } = getLocalParts(at);
  return `${padTwo(hour)}:${padTwo(minute)}`;
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function getIsoWeekday(date: LocalDate): number {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Adds (or subtracts) whole calendar days to a local date. */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${padTwo(shifted.getUTCMonth() + 1)}-${padTwo(shifted.getUTCDate())}`;
}

function getOffsetMs(at: Date) {
  const { year, month, day, hour, minute, second } = getLocalParts(at);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - (at.getTime() - at.getUTCMilliseconds());
}

/**
 * The instant at which the local clock shows `time` on `date`.
 * Times skipped by the spring-forward DST jump resolve to the hour after.
 */
export function createLocalInstant(date: LocalDate, time: LocalTime): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallClockAsUtc - getOffsetMs(new Date(wallClockAsUtc));
  instant = wallClockAsUtc - getOffsetMs(new Date(instant));
  return new Date(instant);
}
