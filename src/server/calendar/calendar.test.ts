import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@/server/db";
import { createTestDb } from "@/server/db/testing";
import { handleScan, rescheduleTask, runTick } from "@/server/engine";
import { createLocalInstant } from "@/shared/time";
import type { CalendarEventBody } from "./events";
import type { GoogleCalendarClient } from "./google-client";
import {
  deleteToqueCalendar,
  ensureToqueCalendar,
  setCalendarClientFactory,
  syncAllCalendarEvents,
} from "./index";

const at = (date: string, time: string) => createLocalInstant(date, time);
const TAG_ID = null as unknown as string;

/** In-memory Google Calendar with a call log and a switch to make calls fail. */
function createFakeGoogle() {
  const calendars = new Map<
    string,
    {
      summary: string;
      timeZone: string;
      events: Map<string, CalendarEventBody>;
    }
  >();
  const calls: string[] = [];
  let nextId = 1;
  const state = { failing: false };
  const check = (name: string) => {
    calls.push(name);
    if (state.failing) throw new Error("Google Calendar respondeu 503");
  };
  const client: GoogleCalendarClient = {
    async getCalendar(id) {
      check("getCalendar");
      return calendars.has(id) ? { id } : null;
    },
    async createCalendar(input) {
      check("createCalendar");
      const id = `cal${nextId++}`;
      calendars.set(id, { ...input, events: new Map() });
      return { id };
    },
    async deleteCalendar(id) {
      check("deleteCalendar");
      calendars.delete(id);
    },
    async insertEvent(calendarId, body) {
      check("insertEvent");
      const id = `ev${nextId++}`;
      calendars.get(calendarId)?.events.set(id, body);
      return { id };
    },
    async updateEvent(calendarId, eventId, body) {
      check("updateEvent");
      const events = calendars.get(calendarId)?.events;
      if (!events?.has(eventId)) return null;
      events.set(eventId, body);
      return { id: eventId };
    },
    async deleteEvent(calendarId, eventId) {
      check("deleteEvent");
      calendars.get(calendarId)?.events.delete(eventId);
    },
  };
  const getEvents = () =>
    [...calendars.values()].flatMap((calendar) => [
      ...calendar.events.values(),
    ]);
  return { client, calendars, calls, state, getEvents };
}

let db: Db;
let google: ReturnType<typeof createFakeGoogle>;

async function connectGoogle() {
  await db
    .insert(schema.googleConnection)
    .values({ id: 1, email: "eu@example.pt", refreshTokenEncrypted: "x" });
}

async function insertTask(
  kind: string,
  config: Record<string, unknown>,
  name = "Tarefa",
) {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      name,
      kind: kind as never,
      config: config as never,
      createdAt: at("2026-10-01", "08:00"),
    })
    .returning();
  return row.id;
}

async function getConnection() {
  const [row] = await db.select().from(schema.googleConnection);
  return row;
}

async function getLiveRows(taskId?: string) {
  return db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        isNull(schema.calendarEvents.deletedAt),
        taskId ? eq(schema.calendarEvents.taskId, taskId) : undefined,
      ),
    );
}

beforeEach(async () => {
  db = await createTestDb();
  google = createFakeGoogle();
  setCalendarClientFactory(() => google.client);
});

afterEach(() => {
  setCalendarClientFactory(null);
});

describe("calendar sync", () => {
  it("does nothing when Google isn't connected", async () => {
    const taskId = await insertTask("timer", { durationMinutes: 45 });
    const result = await handleScan({
      taskId,
      tagId: TAG_ID,
      action: "start",
      now: at("2026-10-09", "14:55"),
    });
    expect(result.tone).toBe("started");
    await runTick(at("2026-10-09", "15:00"), { notifier: null });
    expect(google.calls).toEqual([]);
  });

  it("creates the Toque calendar and the timer event, then deletes it once handled", async () => {
    await connectGoogle();
    const taskId = await insertTask(
      "timer",
      { durationMinutes: 45 },
      "Máquina de lavar",
    );
    await handleScan({
      taskId,
      tagId: TAG_ID,
      action: "start",
      now: at("2026-10-09", "14:55"),
    });

    const [calendar] = [...google.calendars.values()];
    expect(calendar).toMatchObject({
      summary: "Toque",
      timeZone: "Europe/Lisbon",
    });
    expect((await getConnection()).calendarId).toBe("cal1");
    expect(google.getEvents()).toEqual([
      expect.objectContaining({
        summary: "Máquina de lavar",
        start: {
          dateTime: at("2026-10-09", "14:55").toISOString(),
          timeZone: "Europe/Lisbon",
        },
        end: {
          dateTime: at("2026-10-09", "15:40").toISOString(),
          timeZone: "Europe/Lisbon",
        },
        reminders: { useDefault: false, overrides: [] },
      }),
    ]);

    // Still there while "ready"; removed by the complete tag.
    await handleScan({
      taskId,
      tagId: TAG_ID,
      action: "complete",
      now: at("2026-10-09", "15:00"),
    }); // running: info
    expect(google.getEvents()).toHaveLength(1);
    await handleScan({
      taskId,
      tagId: TAG_ID,
      action: "complete",
      now: at("2026-10-09", "16:00"),
    });
    expect(google.getEvents()).toEqual([]);
    expect(await getLiveRows(taskId)).toEqual([]);
  });

  it("updates only when the content changed", async () => {
    await connectGoogle();
    const taskId = await insertTask("until_ack", { weekdays: [5] }, "Lixo");
    await rescheduleTask(taskId, at("2026-10-09", "07:00"));
    expect(google.getEvents()).toHaveLength(4);
    const before = google.calls.length;

    await rescheduleTask(taskId, at("2026-10-09", "07:05"));
    expect(
      google.calls.slice(before).filter((call) => call !== "getCalendar"),
    ).toEqual([]);

    await db
      .update(schema.tasks)
      .set({ name: "Lixo (orgânico)" })
      .where(eq(schema.tasks.id, taskId));
    await rescheduleTask(taskId, at("2026-10-09", "07:10"));
    expect(
      google.calls.slice(before).filter((call) => call === "updateEvent"),
    ).toHaveLength(4);
    expect(
      google.getEvents().every((event) => event.summary === "Lixo (orgânico)"),
    ).toBe(true);
  });

  it("deletes today's until_ack event when acked and recurring occurrences when done", async () => {
    await connectGoogle();
    const rubbish = await insertTask("until_ack", { weekdays: [5] }, "Lixo");
    const plants = await insertTask(
      "recurring",
      { mode: "weekdays", weekdays: [5], reminderTime: "18:00" },
      "Plantas",
    );
    await syncAllCalendarEvents(at("2026-10-09", "07:00"));
    expect(
      (await getLiveRows(rubbish)).map((row) => row.occurrenceKey),
    ).toContain("until_ack:2026-10-09");

    await handleScan({
      taskId: rubbish,
      tagId: TAG_ID,
      action: "start",
      now: at("2026-10-09", "09:00"),
    });
    expect(
      (await getLiveRows(rubbish)).map((row) => row.occurrenceKey).sort(),
    ).toEqual([
      "until_ack:2026-10-16",
      "until_ack:2026-10-23",
      "until_ack:2026-10-30",
    ]);

    await handleScan({
      taskId: plants,
      tagId: TAG_ID,
      action: "start",
      now: at("2026-10-09", "19:00"),
    });
    expect(
      (await getLiveRows(plants)).map((row) => row.occurrenceKey),
    ).not.toContain("recurring:2026-10-09");
  });

  it("rolls the horizon forward from runTick at most once per hour, keeping missed days", async () => {
    await connectGoogle();
    const taskId = await insertTask("until_ack", { weekdays: [5] }, "Lixo");
    await runTick(at("2026-10-09", "07:00"), { notifier: null });
    expect(
      (await getLiveRows(taskId)).map((row) => row.occurrenceKey).sort(),
    ).toEqual([
      "until_ack:2026-10-09",
      "until_ack:2026-10-16",
      "until_ack:2026-10-23",
      "until_ack:2026-10-30",
    ]);

    const calls = google.calls.length;
    await runTick(at("2026-10-09", "07:30"), { notifier: null });
    expect(google.calls.length).toBe(calls); // guarded

    // A week later (Friday 9 missed): 6 November joins, the missed day stays as history.
    await runTick(at("2026-10-16", "07:00"), { notifier: null });
    expect(
      (await getLiveRows(taskId)).map((row) => row.occurrenceKey).sort(),
    ).toEqual([
      "until_ack:2026-10-09",
      "until_ack:2026-10-16",
      "until_ack:2026-10-23",
      "until_ack:2026-10-30",
      "until_ack:2026-11-06",
    ]);
    expect((await getConnection()).lastSyncAt).toEqual(
      at("2026-10-16", "07:00"),
    );
  });

  it("a Google error never breaks a scan; it is recorded and the next sync recovers", async () => {
    await connectGoogle();
    const taskId = await insertTask("timer", { durationMinutes: 45 });
    google.state.failing = true;
    const result = await handleScan({
      taskId,
      tagId: TAG_ID,
      action: "start",
      now: at("2026-10-09", "14:55"),
    });
    expect(result.tone).toBe("started");
    expect((await getConnection()).lastError).toContain("503");

    google.state.failing = false;
    await syncAllCalendarEvents(at("2026-10-09", "15:00"));
    expect(google.getEvents()).toHaveLength(1);
    expect((await getConnection()).lastError).toBeNull();
  });

  it("removes the events of deleted and disabled tasks", async () => {
    await connectGoogle();
    const deleted = await insertTask("until_ack", { weekdays: [5] });
    const disabled = await insertTask("recurring", {
      mode: "interval",
      everyDays: 7,
    });
    await syncAllCalendarEvents(at("2026-10-09", "07:00"));
    expect(google.getEvents().length).toBeGreaterThan(4);

    await db.delete(schema.tasks).where(eq(schema.tasks.id, deleted));
    await rescheduleTask(deleted, at("2026-10-09", "07:05"));
    await db
      .update(schema.tasks)
      .set({ enabled: false })
      .where(eq(schema.tasks.id, disabled));
    await rescheduleTask(disabled, at("2026-10-09", "07:05"));
    expect(google.getEvents()).toEqual([]);
    expect(await getLiveRows()).toEqual([]);
  });

  it("recreates the calendar if it was deleted in Google, and deletes it on disconnect", async () => {
    await connectGoogle();
    const taskId = await insertTask("until_ack", { weekdays: [5] });
    expect(await ensureToqueCalendar()).toBe("cal1");
    await syncAllCalendarEvents(at("2026-10-09", "07:00"));
    google.calendars.clear();

    await syncAllCalendarEvents(at("2026-10-09", "08:00"));
    expect((await getConnection()).calendarId).not.toBe("cal1");
    expect(google.getEvents()).toHaveLength(4);
    expect(await getLiveRows(taskId)).toHaveLength(4);

    await deleteToqueCalendar();
    expect(google.calendars.size).toBe(0);
    expect((await getConnection()).calendarId).toBeNull();
    expect(await getLiveRows()).toEqual([]);
  });
});
