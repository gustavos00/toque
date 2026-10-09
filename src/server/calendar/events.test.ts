import { describe, expect, it, vi } from "vitest";
import { createTestState, createTestTask } from "@/server/engine/test-fixtures";
import { createLocalInstant, getLocalTime } from "@/shared/time";
import { buildDesiredCalendarEvents } from "./events";
import { createGoogleCalendarClient, GoogleCalendarError } from "./google-client";

const at = (date: string, time: string) => createLocalInstant(date, time);
const keysOf = (events: { occurrenceKey: string }[]) => events.map((event) => event.occurrenceKey);

describe("buildDesiredCalendarEvents", () => {
  it("timer: one event while running or ready, none once handled", () => {
    const task = createTestTask("timer", { durationMinutes: 45 }, { name: "Máquina de lavar" });
    const state = createTestState({ timerStartedAt: at("2026-10-09", "14:55"), timerEndsAt: at("2026-10-09", "15:40") });
    const [event] = buildDesiredCalendarEvents(task, state, at("2026-10-09", "15:00"));
    expect(event.body).toMatchObject({
      summary: "Máquina de lavar",
      start: { dateTime: "2026-10-09T13:55:00.000Z", timeZone: "Europe/Lisbon" },
      end: { dateTime: "2026-10-09T14:40:00.000Z", timeZone: "Europe/Lisbon" },
      reminders: { useDefault: false, overrides: [] },
    });
    expect(buildDesiredCalendarEvents(task, state, at("2026-10-09", "18:00"))).toHaveLength(1); // ready
    const handled = { ...state, lastDoneAt: at("2026-10-09", "18:00") };
    expect(buildDesiredCalendarEvents(task, handled, at("2026-10-09", "18:00"))).toEqual([]);
    expect(buildDesiredCalendarEvents(task, createTestState(), at("2026-10-09", "18:00"))).toEqual([]);
  });

  it("until_ack: each scheduled day in the next 4 weeks minus exceptions and today's ack", () => {
    const task = createTestTask("until_ack", { weekdays: [5], exceptDates: ["2026-10-16"], dates: ["2026-10-14"] });
    const now = at("2026-10-09", "10:00"); // Friday
    expect(keysOf(buildDesiredCalendarEvents(task, createTestState(), now))).toEqual([
      "until_ack:2026-10-09",
      "until_ack:2026-10-14",
      "until_ack:2026-10-23",
      "until_ack:2026-10-30",
    ]);
    const [first] = buildDesiredCalendarEvents(task, createTestState(), now);
    expect(getLocalTime(first.start)).toBe("08:00");
    expect(first.end.getTime() - first.start.getTime()).toBe(30 * 60_000);
    const acked = buildDesiredCalendarEvents(task, createTestState({ lastAckDate: "2026-10-09" }), now);
    expect(keysOf(acked)[0]).toBe("until_ack:2026-10-14");
  });

  it("recurring weekdays: keeps the overdue occurrence and lists the next ones", () => {
    const task = createTestTask("recurring", { mode: "weekdays", weekdays: [2], reminderTime: "18:00" });
    const state = createTestState({ lastDoneAt: at("2026-10-06", "19:00") }); // Tuesday done
    const now = at("2026-10-14", "10:00"); // Tuesday 13 missed
    expect(keysOf(buildDesiredCalendarEvents(task, state, now))).toEqual([
      "recurring:2026-10-13",
      "recurring:2026-10-20",
      "recurring:2026-10-27",
      "recurring:2026-11-03",
      "recurring:2026-11-10",
    ]);
  });

  it("recurring interval: projects occurrences every N days, keeping wall-clock time over DST", () => {
    const task = createTestTask("recurring", { mode: "interval", everyDays: 10, reminderTime: "09:00" });
    const events = buildDesiredCalendarEvents(task, createTestState({ lastDoneAt: at("2026-10-05", "12:00") }), at("2026-10-09", "10:00"));
    expect(keysOf(events)).toEqual(["recurring:2026-10-15", "recurring:2026-10-25", "recurring:2026-11-04"]);
    expect(events.map((event) => getLocalTime(event.start))).toEqual(["09:00", "09:00", "09:00"]);
  });

  it("disabled tasks have no events; hashes change only with content", () => {
    const task = createTestTask("until_ack", { weekdays: [5] });
    expect(buildDesiredCalendarEvents({ ...task, enabled: false }, createTestState(), at("2026-10-09", "10:00"))).toEqual([]);
    const a = buildDesiredCalendarEvents(task, createTestState(), at("2026-10-09", "10:00"))[0];
    const b = buildDesiredCalendarEvents(task, createTestState(), at("2026-10-09", "11:00"))[0];
    const renamed = buildDesiredCalendarEvents({ ...task, name: "Lixo" }, createTestState(), at("2026-10-09", "10:00"))[0];
    expect(a.hash).toBe(b.hash);
    expect(renamed.hash).not.toBe(a.hash);
  });
});

describe("createGoogleCalendarClient", () => {
  function createFetch(responses: Response[]) {
    return vi.fn<typeof fetch>(async () => responses.shift() ?? new Response("{}", { status: 500 }));
  }

  it("refreshes the token once on 401", async () => {
    const fetchMock = createFetch([new Response("", { status: 401 }), new Response(JSON.stringify({ id: "ev1" }), { status: 200 })]);
    const getAccessToken = vi.fn(async (options?: { forceRefresh?: boolean }) => (options?.forceRefresh ? "new" : "old"));
    const client = createGoogleCalendarClient({ getAccessToken, fetch: fetchMock });
    const body = buildDesiredCalendarEvents(
      createTestTask("until_ack", { weekdays: [5] }),
      createTestState(),
      at("2026-10-09", "10:00"),
    )[0].body;
    expect(await client.insertEvent("cal@group", body)).toEqual({ id: "ev1" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.googleapis.com/calendar/v3/calendars/cal%40group/events");
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("treats 404/410 on delete as success and throws on other errors", async () => {
    const client = createGoogleCalendarClient({
      getAccessToken: async () => "t",
      fetch: createFetch([new Response("", { status: 410 }), new Response("", { status: 404 }), new Response("quota", { status: 403 })]),
    });
    await expect(client.deleteEvent("c", "e")).resolves.toBeUndefined();
    await expect(client.deleteCalendar("c")).resolves.toBeUndefined();
    await expect(client.deleteEvent("c", "e")).rejects.toBeInstanceOf(GoogleCalendarError);
  });

  it("reports a missing event on update as null", async () => {
    const client = createGoogleCalendarClient({ getAccessToken: async () => "t", fetch: createFetch([new Response("", { status: 404 })]) });
    const body = buildDesiredCalendarEvents(
      createTestTask("until_ack", { weekdays: [5] }),
      createTestState(),
      at("2026-10-09", "10:00"),
    )[0].body;
    expect(await client.updateEvent("c", "e", body)).toBeNull();
  });
});
