import { describe, expect, it } from "vitest";
import { createTaskRequestSchema } from "./api";
import { getRecurringDueAt, isUntilAckDay } from "./schedule";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";
import {
  DEFAULT_UNTIL_ACK_TIMES,
  parseTaskDefinition,
  taskDefinitionSchema,
  untilAckConfigSchema,
} from "./tasks";
import {
  addLocalDays,
  createLocalInstant,
  getIsoWeekday,
  getLocalDate,
  getLocalTime,
} from "./time";

function parseTaskDefinitionSafely(config: Record<string, unknown>) {
  return taskDefinitionSchema.safeParse({ kind: "timer", config });
}

describe("task configs", () => {
  it("applies timer defaults and sorts reminders", () => {
    expect(
      parseTaskDefinition({ kind: "timer", config: { durationMinutes: 90 } }),
    ).toEqual({
      kind: "timer",
      config: {
        durationMinutes: 90,
        almostDoneEnabled: true,
        almostDoneMinutes: 10,
        forgottenRemindersEnabled: true,
        forgottenReminderMinutes: [30, 60],
      },
    });
    const parsed = parseTaskDefinition({
      kind: "timer",
      config: { durationMinutes: 45, forgottenReminderMinutes: [30, 10, 30] },
    });
    expect(parsed.config).toMatchObject({ forgottenReminderMinutes: [10, 30] });
  });

  it("requires the almost-done warning to be before the end (only when enabled)", () => {
    const result = parseTaskDefinitionSafely({
      durationMinutes: 10,
      almostDoneMinutes: 10,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(
      "O aviso tem de ser antes do fim",
    );
    expect(parseTaskDefinitionSafely({ durationMinutes: 5 }).success).toBe(
      false,
    ); // default 10 ≥ 5
    expect(
      parseTaskDefinitionSafely({
        durationMinutes: 5,
        almostDoneEnabled: false,
      }).success,
    ).toBe(true);
    expect(
      parseTaskDefinitionSafely({ durationMinutes: 60, almostDoneMinutes: 15 })
        .success,
    ).toBe(true);
  });

  it("applies until_ack default times and requires at least one day", () => {
    const parsed = untilAckConfigSchema.parse({ weekdays: [4, 1] });
    expect(parsed.weekdays).toEqual([1, 4]);
    expect(parsed.reminderTimes).toEqual(DEFAULT_UNTIL_ACK_TIMES);
    expect(untilAckConfigSchema.safeParse({}).success).toBe(false);
    expect(
      untilAckConfigSchema.safeParse({ dates: ["2026-12-24"] }).success,
    ).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(() =>
      parseTaskDefinition({ kind: "timer", config: { durationMinutes: 0 } }),
    ).toThrow();
    expect(() =>
      parseTaskDefinition({
        kind: "recurring",
        config: { everyDays: 7, reminderTime: "25:00" },
      }),
    ).toThrow();
    expect(() =>
      parseTaskDefinition({ kind: "until_ack", config: { weekdays: [8] } }),
    ).toThrow();
    expect(() => parseTaskDefinition({ kind: "nope", config: {} })).toThrow();
    expect(() =>
      parseTaskDefinition({
        kind: "until_ack",
        config: { dates: ["2026-02-30"] },
      }),
    ).toThrow();
  });

  it("validates create requests with name and definition together", () => {
    const parsed = createTaskRequestSchema.parse({
      name: "  Lixo ",
      kind: "until_ack",
      config: { weekdays: [2, 4] },
    });
    expect(parsed.name).toBe("Lixo");
    expect(parsed.enabled).toBe(true);
    expect(
      createTaskRequestSchema.safeParse({
        name: "",
        kind: "recurring",
        config: { everyDays: 3 },
      }).success,
    ).toBe(false);
  });
});

describe("time (Europe/Lisbon)", () => {
  it("formats local date and time across DST", () => {
    expect(getLocalTime(new Date("2026-07-01T14:40:00Z"))).toBe("15:40"); // WEST, UTC+1
    expect(getLocalTime(new Date("2026-01-15T14:40:00Z"))).toBe("14:40"); // WET, UTC+0
    expect(getLocalDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });

  it("creates local instants", () => {
    expect(createLocalInstant("2026-07-01", "08:00").toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(createLocalInstant("2026-01-15", "08:00").toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
    // DST change days (2026-03-29 forward, 2026-10-25 back).
    expect(createLocalInstant("2026-03-29", "08:00").toISOString()).toBe(
      "2026-03-29T07:00:00.000Z",
    );
    expect(createLocalInstant("2026-10-25", "08:00").toISOString()).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });

  it("computes weekdays and adds days", () => {
    expect(getIsoWeekday("2026-10-09")).toBe(5); // Friday
    expect(getIsoWeekday("2026-10-11")).toBe(7); // Sunday
    expect(addLocalDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("schedule", () => {
  const config = untilAckConfigSchema.parse({
    weekdays: [2, 5],
    dates: ["2026-10-10"],
    exceptDates: ["2026-10-13"],
  });

  it("decides until_ack days", () => {
    expect(isUntilAckDay(config, "2026-10-09")).toBe(true); // Friday
    expect(isUntilAckDay(config, "2026-10-10")).toBe(true); // one-off
    expect(isUntilAckDay(config, "2026-10-11")).toBe(false);
    expect(isUntilAckDay(config, "2026-10-13")).toBe(false); // Tuesday, exception
  });

  it("computes recurring interval due time", () => {
    const createdAt = new Date("2026-10-01T10:00:00Z");
    const now = new Date("2026-10-06T12:00:00Z");
    const config = {
      mode: "interval",
      everyDays: 3,
      reminderTime: "09:00",
    } as const;
    expect(
      getRecurringDueAt(
        config,
        { lastDoneAt: null, createdAt },
        now,
      ).toISOString(),
    ).toBe("2026-10-01T08:00:00.000Z");
    const lastDoneAt = new Date("2026-10-05T22:30:00Z"); // 23:30 local on the 5th
    expect(
      getRecurringDueAt(config, { lastDoneAt, createdAt }, now).toISOString(),
    ).toBe("2026-10-08T08:00:00.000Z");
  });
});

describe("settings", () => {
  it("fills defaults and merges patches field by field", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const merged = mergeSettings(
      { quietHours: { start: "22:00" } },
      { ntfy: { topic: "casa-123" } },
    );
    expect(merged.quietHours).toEqual({
      enabled: true,
      start: "22:00",
      end: "07:30",
    });
    expect(merged.ntfy).toEqual({
      server: "https://ntfy.sh",
      topic: "casa-123",
    });
    expect(() =>
      mergeSettings({}, { ntfy: { topic: "bad topic!" } }),
    ).toThrow();
  });
});
