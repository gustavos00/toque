import { describe, expect, it } from "vitest";
import { createLocalInstant, getLocalTime } from "@/shared/time";
import { selectRowsToSend } from "./catch-up";
import { buildDesiredNotifications } from "./plan";
import {
  createTestSettings,
  createTestState,
  createTestTask,
} from "./test-fixtures";

describe("buildDesiredNotifications", () => {
  const timer = createTestTask("timer", {
    durationMinutes: 60,
    forgottenReminderMinutes: [15, 30, 60],
  });

  it("returns nothing for a disabled task", () => {
    const task = createTestTask(
      "recurring",
      { everyDays: 1 },
      { enabled: false },
    );
    expect(
      buildDesiredNotifications(task, createTestState(), {
        now: new Date(),
        settings: createTestSettings(),
      }),
    ).toEqual([]);
  });

  it("collapses rows deferred by quiet hours into the latest one", () => {
    const startedAt = createLocalInstant("2026-10-09", "22:10");
    const state = createTestState({
      timerStartedAt: startedAt,
      timerEndsAt: createLocalInstant("2026-10-09", "23:10"),
    });
    const rows = buildDesiredNotifications(timer, state, {
      now: startedAt,
      settings: createTestSettings(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("timer_forgotten");
    expect(rows[0].key).toContain(":forgotten:60");
    expect(rows[0].dueAt).toEqual(createLocalInstant("2026-10-10", "07:30"));
  });

  it("drops until_ack alerts that quiet hours would push into the next day", () => {
    const task = createTestTask("until_ack", {
      weekdays: [5],
      reminderTimes: ["21:30", "23:30"],
    });
    const rows = buildDesiredNotifications(task, createTestState(), {
      now: createLocalInstant("2026-10-09", "07:00"),
      settings: createTestSettings(),
    });
    const today = rows.filter((row) => row.key.includes("2026-10-09"));
    expect(today.map((row) => getLocalTime(row.dueAt))).toEqual(["21:30"]);
  });

  it("replaces rows held by a snooze with one reminder at the snooze end", () => {
    const startedAt = createLocalInstant("2026-10-09", "14:00");
    const snoozedUntil = createLocalInstant("2026-10-09", "15:50");
    const state = createTestState({
      timerStartedAt: startedAt,
      timerEndsAt: createLocalInstant("2026-10-09", "15:00"),
      snoozedUntil,
    });
    const rows = buildDesiredNotifications(timer, state, {
      now: createLocalInstant("2026-10-09", "15:20"),
      settings: createTestSettings(),
    });
    expect(rows.map((row) => getLocalTime(row.dueAt))).toEqual([
      "15:50",
      "16:00",
    ]);
    expect(rows[0].key).toMatch(/^snooze:/);
    expect(rows[0].payload.message).toContain("Adiado até às 15:50.");
    expect(rows[0].payload.title).toContain("esqueceste-te");
  });
});

describe("selectRowsToSend (catch-up)", () => {
  const at = (time: string) => createLocalInstant("2026-10-09", time);
  const created = new Date("2026-10-01T00:00:00Z");

  it("sends only the latest due row per task", () => {
    const rows = [
      { id: "a", taskId: "t1", dueAt: at("08:00"), createdAt: created },
      { id: "b", taskId: "t1", dueAt: at("13:00"), createdAt: created },
      { id: "c", taskId: "t2", dueAt: at("09:00"), createdAt: created },
      { id: "d", taskId: null, dueAt: at("09:00"), createdAt: created },
    ];
    const { send, supersede } = selectRowsToSend(rows);
    expect(send.map((row) => row.id).sort()).toEqual(["b", "c", "d"]);
    expect(supersede.map((row) => row.id)).toEqual(["a"]);
  });
});
