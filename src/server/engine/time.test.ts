import { describe, expect, it } from "vitest";
import { createLocalInstant, getLocalDate, getLocalTime } from "@/shared/time";
import { applyQuietHours, getQuietHoursEnd, isInQuietHours } from "./quiet-hours";
import { formatLocalDateLabel, getEndOfLocalDay, getLocalDaysBetween, getMinutesOfDay } from "./time";

const QUIET = { enabled: true, start: "23:00", end: "07:30" };

describe("engine time helpers", () => {
  it("parses minutes of day and day differences", () => {
    expect(getMinutesOfDay("20:30")).toBe(1230);
    expect(getLocalDaysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(getLocalDaysBetween("2026-11-02", "2026-10-30")).toBe(-3);
  });

  it("labels dates in Portuguese", () => {
    expect(formatLocalDateLabel("2026-10-15")).toBe("qui, 15/10");
    expect(formatLocalDateLabel("2026-10-18")).toBe("dom, 18/10");
  });

  it("ends the day on the next local midnight across DST (23h and 25h days)", () => {
    expect(getEndOfLocalDay("2026-03-29").getTime() - createLocalInstant("2026-03-29", "00:00").getTime()).toBe(23 * 3600_000);
    expect(getEndOfLocalDay("2026-10-25").getTime() - createLocalInstant("2026-10-25", "00:00").getTime()).toBe(25 * 3600_000);
  });

  it("keeps wall-clock alert times on DST days (spring forward / fall back)", () => {
    // Lisbon: WET (UTC+0) in winter, WEST (UTC+1) in summer.
    expect(createLocalInstant("2026-03-28", "08:00").toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(createLocalInstant("2026-03-29", "08:00").toISOString()).toBe("2026-03-29T07:00:00.000Z");
    expect(createLocalInstant("2026-10-24", "08:00").toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(createLocalInstant("2026-10-25", "08:00").toISOString()).toBe("2026-10-25T08:00:00.000Z");
    // 01:30 does not exist on 29 March → the hour after.
    expect(getLocalTime(createLocalInstant("2026-03-29", "01:30"))).toBe("02:30");
  });
});

describe("quiet hours", () => {
  it("detects windows that cross midnight", () => {
    expect(isInQuietHours(createLocalInstant("2026-10-09", "23:30"), QUIET)).toBe(true);
    expect(isInQuietHours(createLocalInstant("2026-10-09", "03:00"), QUIET)).toBe(true);
    expect(isInQuietHours(createLocalInstant("2026-10-09", "07:30"), QUIET)).toBe(false);
    expect(isInQuietHours(createLocalInstant("2026-10-09", "22:59"), QUIET)).toBe(false);
  });

  it("detects same-day windows and ignores disabled ones", () => {
    const lunch = { enabled: true, start: "13:00", end: "14:00" };
    expect(isInQuietHours(createLocalInstant("2026-10-09", "13:15"), lunch)).toBe(true);
    expect(isInQuietHours(createLocalInstant("2026-10-09", "14:00"), lunch)).toBe(false);
    expect(isInQuietHours(createLocalInstant("2026-10-09", "23:30"), { ...QUIET, enabled: false })).toBe(false);
  });

  it("defers to the end of the window (next morning for late-night times)", () => {
    const end = getQuietHoursEnd(createLocalInstant("2026-10-09", "23:30"), QUIET);
    expect(getLocalDate(end)).toBe("2026-10-10");
    expect(getLocalTime(end)).toBe("07:30");
    const early = getQuietHoursEnd(createLocalInstant("2026-10-10", "02:00"), QUIET);
    expect(getLocalDate(early)).toBe("2026-10-10");
  });

  it("defers correctly across the October DST change", () => {
    const deferred = applyQuietHours(createLocalInstant("2026-10-24", "23:30"), QUIET, null);
    expect(deferred?.toISOString()).toBe("2026-10-25T07:30:00.000Z");
    const spring = applyQuietHours(createLocalInstant("2026-03-28", "23:30"), QUIET, null);
    expect(spring?.toISOString()).toBe("2026-03-29T06:30:00.000Z");
  });

  it("drops a notification when the deferral passes its expiry", () => {
    const at = createLocalInstant("2026-10-09", "23:15");
    expect(applyQuietHours(at, QUIET, getEndOfLocalDay("2026-10-09"))).toBeNull();
    const outside = createLocalInstant("2026-10-09", "21:30");
    expect(applyQuietHours(outside, QUIET, getEndOfLocalDay("2026-10-09"))).toEqual(outside);
  });
});
