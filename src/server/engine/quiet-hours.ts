import type { Settings } from "@/shared/settings";
import {
  addLocalDays,
  createLocalInstant,
  getLocalDate,
  getLocalTime,
} from "@/shared/time";
import { getMinutesOfDay } from "./time";

/** Daily window (local time) with no notifications. `start > end` crosses midnight. */
type QuietHours = Settings["quietHours"];

function isActive(quiet: QuietHours | null | undefined): quiet is QuietHours {
  return Boolean(quiet && quiet.enabled && quiet.start !== quiet.end);
}

export function isInQuietHours(
  at: Date,
  quiet: QuietHours | null | undefined,
): boolean {
  if (!isActive(quiet)) return false;
  const minutes = getMinutesOfDay(getLocalTime(at));
  const start = getMinutesOfDay(quiet.start);
  const end = getMinutesOfDay(quiet.end);
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

/** Instant at which the quiet window containing `at` ends. Assumes `isInQuietHours(at)`. */
export function getQuietHoursEnd(at: Date, quiet: QuietHours): Date {
  const date = getLocalDate(at);
  const minutes = getMinutesOfDay(getLocalTime(at));
  const endsTomorrow =
    getMinutesOfDay(quiet.start) > getMinutesOfDay(quiet.end) &&
    minutes >= getMinutesOfDay(quiet.start);
  return createLocalInstant(
    endsTomorrow ? addLocalDays(date, 1) : date,
    quiet.end,
  );
}

/**
 * When a notification planned for `fireAt` may actually fire, or `null` to drop it.
 * Policy: defer to the end of the quiet window; drop it if that lands at/after `expiresAt`
 * (e.g. a rubbish alert deferred past the collection day).
 */
export function applyQuietHours(
  fireAt: Date,
  quiet: QuietHours | null | undefined,
  expiresAt: Date | null,
): Date | null {
  if (!isInQuietHours(fireAt, quiet)) return fireAt;
  const deferred = getQuietHoursEnd(fireAt, quiet as QuietHours);
  if (expiresAt && deferred.getTime() >= expiresAt.getTime()) return null;
  return deferred;
}
