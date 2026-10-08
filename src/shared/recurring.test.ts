import { describe, expect, it } from "vitest";
import { getNextRecurringOccurrence, getRecurringDueAt } from "./schedule";
import { recurringConfigSchema, taskDefinitionSchema } from "./tasks";

// October 2026: Mon 5, Tue 6, Fri 9, Tue 13, Fri 16… Lisbon is UTC+1 until
// Sun 25 Oct (then UTC+0); it is UTC+0 until Sun 29 Mar 2026 (then UTC+1).
const TUE_FRI = recurringConfigSchema.parse({ weekdays: [5, 2] });
const CREATED = new Date("2026-09-01T10:00:00Z");

function getDue(
  config: typeof TUE_FRI,
  lastDoneAt: string | null,
  now: string,
  createdAt = CREATED,
) {
  const history = {
    lastDoneAt: lastDoneAt ? new Date(lastDoneAt) : null,
    createdAt,
  };
  const at = new Date(now);
  return {
    dueAt: getRecurringDueAt(config, history, at).toISOString(),
    nextDueAt: getNextRecurringOccurrence(config, history, at).toISOString(),
    overdue: at >= getRecurringDueAt(config, history, at),
  };
}

describe("recurring config", () => {
  it("defaults new tasks to weekdays and requires a day", () => {
    expect(TUE_FRI).toEqual({
      mode: "weekdays",
      weekdays: [2, 5],
      reminderTime: "09:00",
    });
    for (const config of [{}, { mode: "weekdays" }, { weekdays: [] }]) {
      const result = recurringConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error)).toContain(
        "Escolhe pelo menos um dia",
      );
    }
    expect(recurringConfigSchema.safeParse({ weekdays: [8] }).success).toBe(
      false,
    );
  });

  it("reads stored configs without mode as interval", () => {
    expect(
      taskDefinitionSchema.parse({
        kind: "recurring",
        config: { everyDays: 7, reminderTime: "10:00" },
      }).config,
    ).toEqual({ mode: "interval", everyDays: 7, reminderTime: "10:00" });
    expect(
      recurringConfigSchema.parse({ mode: "interval", everyDays: 2 }),
    ).toEqual({ mode: "interval", everyDays: 2, reminderTime: "09:00" });
    expect(recurringConfigSchema.safeParse({ mode: "interval" }).success).toBe(
      false,
    );
  });
});

describe("recurring weekdays schedule", () => {
  it("crosses the week boundary to the next selected day", () => {
    // Done Fri 9 (10:00 local), now Sat 10 → next is Tue 13 09:00 local.
    expect(
      getDue(TUE_FRI, "2026-10-09T09:00:00Z", "2026-10-10T11:00:00Z"),
    ).toEqual({
      dueAt: "2026-10-13T08:00:00.000Z",
      nextDueAt: "2026-10-13T08:00:00.000Z",
      overdue: false,
    });
    const sundays = recurringConfigSchema.parse({ weekdays: [7] });
    expect(
      getDue(sundays, "2026-10-11T18:00:00Z", "2026-10-12T08:00:00Z").dueAt,
    ).toBe("2026-10-18T08:00:00.000Z");
  });

  it("is due at the reminder time and overdue until a scan", () => {
    const before = getDue(
      TUE_FRI,
      "2026-10-09T09:00:00Z",
      "2026-10-13T07:30:00Z",
    );
    expect(before).toMatchObject({
      dueAt: "2026-10-13T08:00:00.000Z",
      overdue: false,
    });
    const after = getDue(
      TUE_FRI,
      "2026-10-09T09:00:00Z",
      "2026-10-13T20:00:00Z",
    );
    expect(after).toEqual({
      dueAt: "2026-10-13T08:00:00.000Z",
      nextDueAt: "2026-10-16T08:00:00.000Z",
      overdue: true,
    });
  });

  it("counts a scan early on the due day for that day", () => {
    // Done Tue 13 at 07:30 local, before the 09:00 reminder.
    expect(
      getDue(TUE_FRI, "2026-10-13T06:30:00Z", "2026-10-13T07:00:00Z"),
    ).toEqual({
      dueAt: "2026-10-16T08:00:00.000Z",
      nextDueAt: "2026-10-16T08:00:00.000Z",
      overdue: false,
    });
  });

  it("collapses missed days into one overdue occurrence (the latest)", () => {
    // Last done Fri 2; Tue 6, Fri 9, Tue 13 and Fri 16 were missed.
    expect(
      getDue(TUE_FRI, "2026-10-02T09:00:00Z", "2026-10-17T11:00:00Z"),
    ).toEqual({
      dueAt: "2026-10-16T08:00:00.000Z",
      nextDueAt: "2026-10-20T08:00:00.000Z",
      overdue: true,
    });
    // Months without a scan behave the same.
    expect(
      getDue(TUE_FRI, "2026-06-02T09:00:00Z", "2026-10-17T11:00:00Z").dueAt,
    ).toBe("2026-10-16T08:00:00.000Z");
  });

  it("starts from the creation instant when never done", () => {
    // Created Tue 6 at 11:00 local, after that day's 09:00 → Fri 9.
    const createdAt = new Date("2026-10-06T10:00:00Z");
    expect(getDue(TUE_FRI, null, "2026-10-06T12:00:00Z", createdAt).dueAt).toBe(
      "2026-10-09T08:00:00.000Z",
    );
    // …and is overdue from then if never scanned (only the latest counts).
    expect(
      getDue(TUE_FRI, null, "2026-10-14T12:00:00Z", createdAt),
    ).toMatchObject({ dueAt: "2026-10-13T08:00:00.000Z", overdue: true });
  });

  it("keeps the local reminder time across DST changes", () => {
    const mondays = recurringConfigSchema.parse({
      weekdays: [1],
      reminderTime: "09:00",
    });
    // Autumn: Mon 19 Oct (UTC+1) → Mon 26 Oct (UTC+0).
    expect(
      getDue(mondays, "2026-10-19T08:30:00Z", "2026-10-24T12:00:00Z").dueAt,
    ).toBe("2026-10-26T09:00:00.000Z");
    // Spring: Mon 23 Mar (UTC+0) → Mon 30 Mar (UTC+1).
    expect(
      getDue(
        mondays,
        "2026-03-23T09:30:00Z",
        "2026-03-28T12:00:00Z",
        new Date("2026-01-01T00:00:00Z"),
      ).dueAt,
    ).toBe("2026-03-30T08:00:00.000Z");
  });
});

describe("recurring interval next occurrence", () => {
  it("is everyDays after today", () => {
    const config = recurringConfigSchema.parse({ everyDays: 3 });
    expect(
      getDue(config, "2026-10-01T09:00:00Z", "2026-10-09T12:00:00Z"),
    ).toEqual({
      dueAt: "2026-10-04T08:00:00.000Z",
      nextDueAt: "2026-10-12T08:00:00.000Z",
      overdue: true,
    });
  });
});
