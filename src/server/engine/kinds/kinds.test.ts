import { describe, expect, it } from "vitest";
import { getTimerPhase } from "@/shared/schedule";
import { createLocalInstant, getLocalTime } from "@/shared/time";
import {
  createTestSettings,
  createTestState,
  createTestTask,
} from "../test-fixtures";
import { recurringHandler } from "./recurring";
import { timerHandler } from "./timer";
import {
  getEscalationPriority,
  getNextUntilAckDate,
  untilAckHandler,
} from "./until-ack";

const settings = createTestSettings();

describe("timer", () => {
  const task = createTestTask(
    "timer",
    { durationMinutes: 45, forgottenReminderMinutes: [60, 30] },
    { name: "Máquina" },
  );
  const quiet = createTestTask("timer", {
    durationMinutes: 45,
    almostDoneEnabled: false,
    forgottenRemindersEnabled: false,
  });
  const start = createLocalInstant("2026-10-09", "14:55");
  const running = createTestState(
    timerHandler.handleScan(task, createTestState(), start).patch,
  );
  const at = (time: string) => createLocalInstant("2026-10-09", time);

  it("starts on the first scan", () => {
    const outcome = timerHandler.handleScan(task, createTestState(), start);
    expect(outcome.result).toEqual({
      title: "Máquina",
      message: "A contar 45 min · acaba às 15:40",
      tone: "started",
    });
    expect(outcome.patch.timerEndsAt?.getTime()).toBe(
      start.getTime() + 45 * 60_000,
    );
    expect(outcome.events[0].type).toBe("timer_started");
  });

  it("plans the heads-up, 'pronto' (no Feito button) and sorted forgotten reminders by default", () => {
    const rows = timerHandler.planNotifications(task, running, {
      now: start,
      settings,
    });
    expect(
      rows.map((row) => [row.key.split(":").pop(), getLocalTime(row.dueAt)]),
    ).toEqual([
      ["almost", "15:30"],
      ["finished", "15:40"],
      ["30", "16:10"],
      ["60", "16:40"],
    ]);
    expect(rows[0].payload).toMatchObject({
      title: "Máquina quase a acabar",
      message: "Faltam 10 min (acaba às 15:40).",
      priority: 3,
    });
    expect(rows[0].expiresAt).toEqual(at("15:40"));
    expect(rows[1].payload.actions).toEqual(["open"]);
    expect(rows[2].payload.actions).toContain("done");
    expect(rows[3].payload.priority).toBe(5);
  });

  it("only plans 'pronto' when the heads-up and reminders are disabled", () => {
    const rows = timerHandler.planNotifications(quiet, running, {
      now: start,
      settings,
    });
    expect(rows.map((row) => row.kind)).toEqual(["timer_finished"]);
  });

  it("skips a heads-up that would fall before the start", () => {
    const short = createTestTask("timer", {
      durationMinutes: 5,
      almostDoneEnabled: false,
    });
    const shortState = createTestState(
      timerHandler.handleScan(short, createTestState(), start).patch,
    );
    const longHeadsUp = {
      ...short,
      config: {
        ...short.config,
        almostDoneEnabled: true,
        almostDoneMinutes: 5,
      },
    };
    expect(
      timerHandler
        .planNotifications(longHeadsUp, shortState, { now: start, settings })
        .some((r) => r.key.endsWith(":almost")),
    ).toBe(false);
  });

  it("a start scan while running changes nothing", () => {
    expect(timerHandler.handleScan(task, running, at("15:00"))).toEqual({
      patch: {},
      events: [],
      result: {
        title: "Máquina",
        message: "Já está a decorrer · acaba às 15:40",
        tone: "info",
      },
    });
  });

  it("a start scan after the end starts a new cycle with new keys", () => {
    const outcome = timerHandler.handleScan(task, running, at("18:00"));
    expect(outcome.result.tone).toBe("started");
    const next = timerHandler.planNotifications(
      task,
      createTestState(outcome.patch),
      { now: at("18:00"), settings },
    );
    const old = timerHandler.planNotifications(task, running, {
      now: at("18:00"),
      settings,
    });
    expect(next.some((row) => old.some((o) => o.key === row.key))).toBe(false);
  });

  it("complete / 'Já tratei' after the end handles the cycle and stops its reminders", () => {
    const outcome = timerHandler.handleDone(task, running, at("16:00"));
    expect(outcome.result.tone).toBe("done");
    expect(outcome.patch).toEqual({
      lastDoneAt: at("16:00"),
      snoozedUntil: null,
    });
    const handled = createTestState({ ...running, ...outcome.patch });
    expect(getTimerPhase(handled, at("16:00"))).toBe("handled");
    expect(
      timerHandler.planNotifications(task, handled, {
        now: at("16:00"),
        settings,
      }),
    ).toEqual([]);
    expect(
      timerHandler.handleDone(task, handled, at("16:05")).result,
    ).toMatchObject({ tone: "info", message: "Nada por tratar." });
  });

  it("complete while running or with no cycle is informational", () => {
    expect(
      timerHandler.handleDone(task, running, at("15:00")).result,
    ).toMatchObject({
      tone: "info",
      message: "Ainda está a decorrer · acaba às 15:40",
    });
    expect(
      timerHandler.handleDone(task, createTestState(), start).result.message,
    ).toBe("Nada por tratar.");
  });
});

describe("until_ack", () => {
  // Rubbish on Mondays and Fridays, plus a one-off Wednesday, minus a holiday Monday.
  const task = createTestTask(
    "until_ack",
    { weekdays: [1, 5], dates: ["2026-10-14"], exceptDates: ["2026-10-12"] },
    { name: "Lixo" },
  );

  it("finds the next scheduled day skipping exceptions", () => {
    expect(getNextUntilAckDate(task.config, "2026-10-09")).toBe("2026-10-14");
    expect(getNextUntilAckDate(task.config, "2026-10-14")).toBe("2026-10-16");
  });

  it("escalates priority through the day", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => getEscalationPriority(i, 6))).toEqual([
      3, 3, 4, 4, 5, 5,
    ]);
  });

  it("plans today's six alerts and the next day's", () => {
    const now = createLocalInstant("2026-10-09", "07:00"); // Friday
    const rows = untilAckHandler.planNotifications(task, createTestState(), {
      now,
      settings,
    });
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 6).map((row) => getLocalTime(row.dueAt))).toEqual([
      "08:00",
      "13:00",
      "17:00",
      "19:00",
      "20:30",
      "21:30",
    ]);
    expect(rows[6].key).toContain("2026-10-14");
    expect(rows[0].expiresAt?.toISOString()).toBe(
      createLocalInstant("2026-10-10", "00:00").toISOString(),
    );
  });

  it("acks today on scan and stops today's alerts", () => {
    const now = createLocalInstant("2026-10-09", "13:05");
    const outcome = untilAckHandler.handleScan(task, createTestState(), now);
    expect(outcome.result).toEqual({
      title: "Lixo",
      message: "Feito por hoje. Próxima vez: qua, 14/10.",
      tone: "done",
    });
    expect(outcome.patch.lastAckDate).toBe("2026-10-09");
    const rows = untilAckHandler.planNotifications(
      task,
      createTestState(outcome.patch),
      { now, settings },
    );
    expect(rows.every((row) => row.key.includes("2026-10-14"))).toBe(true);
  });

  it("does not ack on a day that is not scheduled", () => {
    const outcome = untilAckHandler.handleScan(
      task,
      createTestState(),
      createLocalInstant("2026-10-10", "10:00"),
    );
    expect(outcome.result.tone).toBe("info");
    expect(outcome.patch).toEqual({});
  });

  it("schedules alerts at local wall-clock time on the DST Sunday", () => {
    const sunday = createTestTask("until_ack", { weekdays: [7] });
    const rows = untilAckHandler.planNotifications(sunday, createTestState(), {
      now: createLocalInstant("2026-10-25", "00:30"),
      settings,
    });
    expect(rows[0].dueAt.toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(rows[6].dueAt.toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });
});

describe("recurring", () => {
  const task = createTestTask(
    "recurring",
    { everyDays: 7, reminderTime: "09:00" },
    { name: "Regar" },
  );
  const lastDoneAt = createLocalInstant("2026-10-01", "20:00");

  it("plans the due notification on the due day", () => {
    const rows = recurringHandler.planNotifications(
      task,
      createTestState({ lastDoneAt }),
      {
        now: createLocalInstant("2026-10-05", "12:00"),
        settings,
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "recurring_due",
      dueAt: createLocalInstant("2026-10-08", "09:00"),
    });
  });

  it("plans a daily overdue reminder (today and tomorrow) once past the deadline", () => {
    const rows = recurringHandler.planNotifications(
      task,
      createTestState({ lastDoneAt }),
      {
        now: createLocalInstant("2026-10-10", "12:00"),
        settings,
      },
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "recurring_overdue",
      "recurring_overdue",
    ]);
    expect(rows[0].payload.message).toBe("Era para qui, 08/10 — há 2 dias.");
    expect(rows[1].dueAt).toEqual(createLocalInstant("2026-10-11", "09:00"));
  });

  it("resets on scan", () => {
    const now = createLocalInstant("2026-10-10", "12:00");
    const outcome = recurringHandler.handleScan(
      task,
      createTestState({ lastDoneAt }),
      now,
    );
    expect(outcome.patch.lastDoneAt).toEqual(now);
    expect(outcome.result.message).toBe("Feito. Próxima vez: sáb, 17/10.");
  });
});

describe("recurring — weekdays mode", () => {
  // Tuesdays and Thursdays at 09:00. 13/10/2026 is a Tuesday.
  const task = createTestTask(
    "recurring",
    { mode: "weekdays", weekdays: [2, 4], reminderTime: "09:00" },
    { name: "Plantas" },
  );
  const lastDoneAt = createLocalInstant("2026-10-08", "20:00"); // Thursday, covered
  const plan = (now: Date, done: Date | null = lastDoneAt) =>
    recurringHandler.planNotifications(
      task,
      createTestState({ lastDoneAt: done }),
      { now, settings },
    );

  it("plans the 'due' notification on the next selected weekday", () => {
    const rows = plan(createLocalInstant("2026-10-12", "12:00"));
    expect(
      rows.map((row) => [row.key.split(":").slice(2).join(":"), row.kind]),
    ).toEqual([["2026-10-13:due", "recurring_due"]]);
    expect(rows[0].dueAt).toEqual(createLocalInstant("2026-10-13", "09:00"));
  });

  it("a scan on the due day covers it and points to the next selected day", () => {
    const now = createLocalInstant("2026-10-13", "10:00");
    const outcome = recurringHandler.handleScan(
      task,
      createTestState({ lastDoneAt }),
      now,
    );
    expect(outcome.result).toMatchObject({
      tone: "done",
      message: "Feito. Próxima vez: qui, 15/10.",
    });
    expect(plan(now, now).map((row) => row.key)).toEqual([
      `recurring:${task.id}:2026-10-15:due`,
    ]);
  });

  it("a missed day gets one overdue reminder, then the next selected day is 'due' again", () => {
    const wednesday = plan(createLocalInstant("2026-10-14", "12:00"));
    expect(
      wednesday.map((row) => [row.kind, row.key.split(":").slice(2).join(":")]),
    ).toEqual([
      ["recurring_overdue", "2026-10-13:overdue:2026-10-14"],
      ["recurring_due", "2026-10-15:due"],
    ]);
    expect(wednesday[0].payload.message).toBe(
      "Era para ter, 13/10 — há 1 dia.",
    );

    // Thursday after 09:00: the missed Tuesday collapses into Thursday's occurrence.
    const thursday = plan(createLocalInstant("2026-10-15", "10:00"));
    expect(
      thursday.map((row) => [row.kind, row.key.split(":").slice(2).join(":")]),
    ).toEqual([
      ["recurring_due", "2026-10-15:due"],
      ["recurring_overdue", "2026-10-15:overdue:2026-10-16"],
    ]);
  });
});
