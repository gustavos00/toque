import { describe, expect, it } from "vitest";
import { createLocalInstant } from "@/shared";
import {
  countLocalDays,
  formatDurationLeft,
  formatFromNow,
  formatTimeLeft,
  getRecurringSummary,
  getTimerSummary,
  getUntilAckSummary,
} from "./remaining";
import { formatWeekdaySummary } from "./weekdays";

// Friday 9 Oct 2026, Europe/Lisbon (UTC+1).
const at = (date: string, time: string) => createLocalInstant(date, time);
const NOW = at("2026-10-09", "14:00");
const MINUTE = 60_000;

describe("durations", () => {
  it("formats time left, rounding up to the minute", () => {
    expect(formatDurationLeft(20_000)).toBe("1 min");
    expect(formatDurationLeft(0)).toBe("menos de 1 min");
    expect(formatDurationLeft(42 * MINUTE)).toBe("42 min");
    expect(formatDurationLeft(130 * MINUTE)).toBe("2 h 10 min");
    expect(formatDurationLeft(180 * MINUTE)).toBe("3 h");
  });

  it("uses singular and plural of faltar", () => {
    expect(formatTimeLeft(42 * MINUTE)).toBe("faltam 42 min");
    expect(formatTimeLeft(30_000)).toBe("falta 1 min");
    expect(formatTimeLeft(130 * MINUTE)).toBe("faltam 2 h 10 min");
  });

  it("formats compact relative times", () => {
    expect(formatFromNow(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe("daqui a 5 min");
    expect(formatFromNow(new Date(NOW.getTime() + 80 * MINUTE), NOW)).toBe("daqui a 1 h 20");
    expect(formatFromNow(new Date(NOW.getTime() + 120 * MINUTE), NOW)).toBe("daqui a 2 h");
    expect(formatFromNow(NOW, NOW)).toBe("agora");
  });

  it("counts calendar days across months", () => {
    expect(countLocalDays("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("getTimerSummary", () => {
  const config = {
    durationMinutes: 90,
    almostDoneEnabled: true,
    almostDoneMinutes: 9,
    forgottenRemindersEnabled: true,
    forgottenReminderMinutes: [30, 60],
  };

  it("counts down while running, with progress and the heads-up mark", () => {
    const summary = getTimerSummary(
      config,
      {
        startedAt: new Date(NOW.getTime() - 48 * MINUTE).toISOString(),
        endsAt: at("2026-10-09", "14:42").toISOString(),
        handledAt: null,
      },
      NOW,
    );
    expect(summary.phase).toBe("running");
    expect(summary.headline).toBe("faltam 42 min");
    expect(summary.detail).toBe("acaba às 14:42");
    expect(summary.progress).toBeCloseTo(48 / 90);
    expect(summary.almostDoneMark).toBeCloseTo(0.9);
  });

  it("flips to ready the moment it ends, without new data", () => {
    const state = { startedAt: null, endsAt: at("2026-10-09", "14:00").toISOString(), handledAt: null };
    expect(getTimerSummary(config, state, new Date(NOW.getTime() - 1000)).phase).toBe("running");
    const ready = getTimerSummary(config, state, NOW);
    expect(ready.phase).toBe("ready");
    expect(ready.headline).toBe("Pronta · por estender");
  });

  it("shows when it was handled", () => {
    const summary = getTimerSummary(
      config,
      {
        startedAt: null,
        endsAt: at("2026-10-09", "12:00").toISOString(),
        handledAt: at("2026-10-09", "12:20").toISOString(),
      },
      NOW,
    );
    expect(summary.headline).toBe("Tratada às 12:20");
  });
});

describe("getUntilAckSummary", () => {
  const config = { weekdays: [2, 5], dates: [], exceptDates: [], reminderTimes: ["08:00", "13:00", "15:20", "21:30"] };

  it("shows the next alert on a collection day", () => {
    const summary = getUntilAckSummary(config, { lastAckDate: null, snoozedUntil: null }, NOW);
    expect(summary.headline).toBe("Por fazer");
    expect(summary.detail).toBe("próximo aviso às 15:20 (daqui a 1 h 20)");
  });

  it("shows the next collection day on other days", () => {
    const saturday = at("2026-10-10", "10:00");
    const summary = getUntilAckSummary(config, null, saturday);
    expect(summary.headline).toBe("Próxima recolha: terça (daqui a 3 dias)");
  });

  it("says done once acknowledged today", () => {
    const summary = getUntilAckSummary(config, { lastAckDate: "2026-10-09", snoozedUntil: null }, NOW);
    expect(summary.headline).toBe("Feito hoje");
    expect(summary.tone).toBe("success");
  });
});

describe("getRecurringSummary", () => {
  const createdAt = at("2026-09-01", "10:00").toISOString();

  it("interval: days left, then late", () => {
    const config = { mode: "interval" as const, everyDays: 3, reminderTime: "09:00" };
    const doneYesterday = at("2026-10-08", "18:00").toISOString();
    expect(getRecurringSummary(config, doneYesterday, createdAt, NOW).headline).toBe("Faltam 2 dias");
    const doneLongAgo = at("2026-10-05", "18:00").toISOString();
    const late = getRecurringSummary(config, doneLongAgo, createdAt, NOW);
    expect(late.headline).toBe("Atrasada há 1 dia");
    expect(late.tone).toBe("danger");
  });

  it("weekdays: today, next day, and late since a weekday", () => {
    const config = { mode: "weekdays" as const, weekdays: [1, 5], reminderTime: "09:00" };
    const morning = at("2026-10-09", "08:00");
    const doneMonday = at("2026-10-05", "10:00").toISOString();
    expect(getRecurringSummary(config, doneMonday, createdAt, morning).headline).toBe("Hoje");
    const doneToday = at("2026-10-09", "08:30").toISOString();
    expect(getRecurringSummary(config, doneToday, createdAt, NOW).headline).toBe("Próxima: segunda (daqui a 3 dias)");
    // Missed Monday; on Thursday it is still late "since Monday".
    const doneLastFriday = at("2026-10-02", "10:00").toISOString();
    const thursday = at("2026-10-08", "14:00");
    expect(getRecurringSummary(config, doneLastFriday, createdAt, thursday).headline).toBe("Atrasada desde segunda");
  });
});

describe("formatWeekdaySummary", () => {
  it("reads naturally", () => {
    expect(formatWeekdaySummary([1, 4])).toBe("Todas as segundas e quintas");
    expect(formatWeekdaySummary([1, 2, 3, 4, 5, 6, 7])).toBe("Todos os dias");
    expect(formatWeekdaySummary([6, 7])).toBe("Todos os fins de semana");
    expect(formatWeekdaySummary([1, 6])).toBe("Todas as segundas, e todos os sábados");
  });
});
