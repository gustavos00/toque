import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@/server/db";
import { createTestDb } from "@/server/db/testing";
import { createActionUrl, readSignedActionParams, type Notifier, type OutgoingNotification } from "@/server/notify";
import { createLocalInstant } from "@/shared/time";
import { handleNotificationAction, handleScan, rescheduleTask, runTick } from "./index";

const SECRET = "integration-secret-0123456789";
const TAG_ID = null as unknown as string; // events.tag_id is nullable; no tag row needed here
const at = (date: string, time: string) => createLocalInstant(date, time);

function createFakeNotifier(options: { failTimes?: number } = {}) {
  const sent: OutgoingNotification[] = [];
  let failures = options.failTimes ?? 0;
  const notifier: Notifier = {
    async send(notification) {
      if (failures > 0) {
        failures--;
        throw new Error("ntfy em baixo");
      }
      sent.push(notification);
    },
  };
  return { notifier, sent };
}

let db: Db;

async function insertTask(kind: string, config: Record<string, unknown>, name = "Tarefa") {
  const [row] = await db
    .insert(schema.tasks)
    .values({ name, kind: kind as never, config: config as never, createdAt: at("2026-10-01", "08:00") })
    .returning();
  return row.id;
}

async function getPending(taskId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.taskId, taskId),
        isNull(schema.notifications.sentAt),
        isNull(schema.notifications.cancelledAt),
      ),
    );
}

beforeAll(() => {
  process.env.TOQUE_ACTION_SECRET = SECRET;
  process.env.TOQUE_PUBLIC_URL = "https://toque.example.pt";
});

afterAll(() => {
  delete process.env.TOQUE_ACTION_SECRET;
  delete process.env.TOQUE_PUBLIC_URL;
});

beforeEach(async () => {
  db = await createTestDb();
});

describe("timer end to end", () => {
  it("start → heads-up superseded by 'pronto' on a late tick → complete stops reminders", async () => {
    const taskId = await insertTask("timer", { durationMinutes: 45 }, "Máquina");
    const result = await handleScan({ taskId, tagId: TAG_ID, action: "start", now: at("2026-10-09", "14:55") });
    expect(result).toMatchObject({ tone: "started", message: "A contar 45 min · acaba às 15:40" });
    expect((await getPending(taskId)).map((row) => row.kind).sort()).toEqual([
      "timer_almost_done",
      "timer_finished",
      "timer_forgotten",
      "timer_forgotten",
    ]);

    // Tick missed the heads-up: only "pronto" is sent.
    const { notifier, sent } = createFakeNotifier();
    expect(await runTick(at("2026-10-09", "15:41"), { notifier })).toEqual({ sent: 1 });
    expect(sent[0].title).toBe("Máquina: pronto");
    expect(sent[0].buttons).toEqual([]);
    expect(sent[0].clickUrl).toBe("https://toque.example.pt/");
    // Idempotent: same minute again sends nothing.
    expect(await runTick(at("2026-10-09", "15:41"), { notifier })).toEqual({ sent: 0 });

    // A start scan while running would be info; after the end the forgotten reminder fires with "Já tratei".
    expect(await runTick(at("2026-10-09", "16:11"), { notifier })).toEqual({ sent: 1 });
    expect(sent[1].buttons.map((button) => button.label)).toEqual(["Já tratei"]);

    const done = await handleScan({ taskId, tagId: TAG_ID, action: "complete", now: at("2026-10-09", "16:15") });
    expect(done.tone).toBe("done");
    expect(await getPending(taskId)).toEqual([]);
    expect(await runTick(at("2026-10-09", "17:00"), { notifier })).toEqual({ sent: 0 });

    const history = await db.select().from(schema.events).where(eq(schema.events.taskId, taskId));
    expect(history.map((event) => event.type)).toEqual(
      expect.arrayContaining(["timer_started", "notification_sent", "timer_finished", "done"]),
    );
  });

  it("two overlapping ticks send a due row only once", async () => {
    const taskId = await insertTask("timer", { durationMinutes: 30, almostDoneEnabled: false });
    await handleScan({ taskId, tagId: TAG_ID, action: "start", now: at("2026-10-09", "10:00") });
    const { notifier, sent } = createFakeNotifier();
    const now = at("2026-10-09", "10:30");
    const results = await Promise.all([runTick(now, { notifier }), runTick(now, { notifier })]);
    expect(results[0].sent + results[1].sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("retries a failed send on the next tick", async () => {
    const taskId = await insertTask("timer", { durationMinutes: 30, almostDoneEnabled: false });
    await handleScan({ taskId, tagId: TAG_ID, action: "start", now: at("2026-10-09", "10:00") });
    const { notifier, sent } = createFakeNotifier({ failTimes: 1 });
    expect(await runTick(at("2026-10-09", "10:30"), { notifier })).toEqual({ sent: 0 });
    const [failed] = await getPending(taskId).then((rows) => rows.filter((row) => row.kind === "timer_finished"));
    expect(failed).toMatchObject({ attempts: 1, lastError: "ntfy em baixo" });
    expect(await runTick(at("2026-10-09", "10:31"), { notifier })).toEqual({ sent: 1 });
    expect(sent[0].title).toContain("pronto");
  });
});

describe("until_ack end to end", () => {
  it("catches up with only the latest alert, then a scan stops the rest of the day", async () => {
    const taskId = await insertTask("until_ack", { weekdays: [5] }, "Lixo"); // Fridays
    const { notifier, sent } = createFakeNotifier();
    // First tick of the day at 18:00: 08:00, 13:00 and 17:00 are due → only 17:00 goes out.
    expect(await runTick(at("2026-10-09", "18:00"), { notifier })).toEqual({ sent: 1 });
    expect(sent[0].message).toBe("Ainda não está feito (aviso 3 de 6).");
    expect(sent[0].buttons.map((button) => button.label)).toEqual(["Feito", "Adiar 30 min"]);

    const result = await handleScan({ taskId, tagId: TAG_ID, action: "start", now: at("2026-10-09", "18:30") });
    expect(result).toMatchObject({ tone: "done", message: "Feito por hoje. Próxima vez: sex, 16/10." });
    const pending = await getPending(taskId);
    expect(pending.every((row) => row.dedupeKey?.includes("2026-10-16"))).toBe(true);
    expect(await runTick(at("2026-10-09", "21:31"), { notifier })).toEqual({ sent: 0 });
  });

  it("drops yesterday's unsent alerts after a long outage", async () => {
    const taskId = await insertTask("until_ack", { weekdays: [5] });
    await rescheduleTask(taskId, at("2026-10-09", "07:00"));
    const { notifier, sent } = createFakeNotifier();
    // No tick until Saturday morning: Friday's rows are no longer desired → cancelled, nothing sent.
    expect(await runTick(at("2026-10-10", "09:00"), { notifier })).toEqual({ sent: 0 });
    expect(sent).toEqual([]);
  });
});

describe("notification actions", () => {
  it("'Adiar' holds the alerts and sends one reminder at the snooze end; bad signatures are refused", async () => {
    const taskId = await insertTask("until_ack", { weekdays: [5] }, "Lixo");
    const { notifier, sent } = createFakeNotifier();
    await runTick(at("2026-10-09", "13:00"), { notifier });

    const now = at("2026-10-09", "13:02");
    const url = new URL(
      createActionUrl({ baseUrl: "https://toque.example.pt", action: "snooze", taskId, occurrence: "2026-10-09", expiresAt: at("2026-10-10", "13:00"), secret: SECRET }),
    );
    const tampered = { ...readSignedActionParams(url, "snooze"), sig: "x".repeat(43) };
    expect(await handleNotificationAction(tampered, now)).toMatchObject({ ok: false, status: 403 });

    const outcome = await handleNotificationAction(readSignedActionParams(url, "snooze"), now);
    expect(outcome).toMatchObject({ ok: true, result: { message: "Adiado. Volto a lembrar às 13:32." } });
    expect(await runTick(at("2026-10-09", "13:33"), { notifier })).toEqual({ sent: 1 });
    expect(sent.at(-1)?.message).toContain("Adiado até às 13:32.");

    const doneUrl = new URL(
      createActionUrl({ baseUrl: "https://toque.example.pt", action: "done", taskId, occurrence: "2026-10-09", expiresAt: at("2026-10-10", "13:00"), secret: SECRET }),
    );
    const done = await handleNotificationAction(readSignedActionParams(doneUrl, "done"), at("2026-10-09", "13:40"));
    expect(done).toMatchObject({ ok: true, result: { tone: "done" } });
    expect(await runTick(at("2026-10-09", "17:01"), { notifier })).toEqual({ sent: 0 });
  });
});

describe("stale notification buttons", () => {
  function createLink(action: "done" | "snooze", taskId: string, occurrence: string) {
    const url = new URL(
      createActionUrl({ baseUrl: "https://toque.example.pt", action, taskId, occurrence, expiresAt: at("2026-10-20", "00:00"), secret: SECRET }),
    );
    return readSignedActionParams(url, action);
  }

  it("binds the buttons of a sent alert to its occurrence", async () => {
    await insertTask("until_ack", { weekdays: [4, 5] }, "Lixo");
    const { notifier, sent } = createFakeNotifier();
    await runTick(at("2026-10-09", "08:00"), { notifier });
    expect(sent[0].buttons.every((button) => button.url.includes("occ=2026-10-09"))).toBe(true);
  });

  it("yesterday's until_ack 'Feito' and 'Adiar' change nothing today", async () => {
    const taskId = await insertTask("until_ack", { weekdays: [4, 5] }, "Lixo"); // Thursday + Friday
    const now = at("2026-10-09", "10:00"); // Friday
    for (const action of ["done", "snooze"] as const) {
      expect(await handleNotificationAction(createLink(action, taskId, "2026-10-08"), now)).toEqual({
        ok: true,
        result: { title: "Lixo", message: "Este aviso já não está ativo.", tone: "info" },
      });
    }
    const [state] = await db.select().from(schema.taskState).where(eq(schema.taskState.taskId, taskId));
    expect(state).toBeUndefined();

    // Today's link still works.
    expect(await handleNotificationAction(createLink("done", taskId, "2026-10-09"), now)).toMatchObject({
      ok: true,
      result: { tone: "done" },
    });
  });

  it("a timer link from a previous cycle is stale after a new start", async () => {
    const taskId = await insertTask("timer", { durationMinutes: 30 }, "Máquina");
    const firstStart = at("2026-10-09", "10:00");
    await handleScan({ taskId, tagId: TAG_ID, action: "start", now: firstStart });
    const oldLink = createLink("done", taskId, String(firstStart.getTime()));
    await handleScan({ taskId, tagId: TAG_ID, action: "start", now: at("2026-10-09", "11:00") });

    const stale = await handleNotificationAction(oldLink, at("2026-10-09", "11:40"));
    expect(stale).toMatchObject({ ok: true, result: { message: "Este aviso já não está ativo.", tone: "info" } });
    const [state] = await db.select().from(schema.taskState).where(eq(schema.taskState.taskId, taskId));
    expect(state.lastDoneAt).toBeNull();

    const current = createLink("done", taskId, String(at("2026-10-09", "11:00").getTime()));
    expect(await handleNotificationAction(current, at("2026-10-09", "11:40"))).toMatchObject({
      ok: true,
      result: { tone: "done" },
    });
  });
});

describe("recurring weekdays end to end", () => {
  it("sends one notification per day across a missed Tuesday, never one per missed day", async () => {
    await insertTask("recurring", { mode: "weekdays", weekdays: [2, 4], reminderTime: "09:00" }, "Plantas");
    const { notifier, sent } = createFakeNotifier();
    const minutes = ["2026-10-13", "2026-10-14", "2026-10-15"].flatMap((date) => [
      at(date, "08:59"),
      at(date, "09:00"),
      at(date, "09:01"),
      at(date, "12:00"),
    ]);
    for (const now of minutes) await runTick(now, { notifier });
    expect(sent.map((notification) => [notification.title, notification.message])).toEqual([
      ["Plantas", "Hoje é dia. Toca na tag quando estiver feito."],
      ["Plantas: em atraso", "Era para ter, 13/10 — há 1 dia."],
      ["Plantas", "Hoje é dia. Toca na tag quando estiver feito."],
    ]);
  });
});

describe("rescheduleTask", () => {
  it("moves the schedule when a task changes from interval to weekdays", async () => {
    const taskId = await insertTask("recurring", { everyDays: 7, reminderTime: "09:00" }, "Plantas");
    await db.insert(schema.taskState).values({ taskId, lastDoneAt: at("2026-10-08", "20:00") });
    await rescheduleTask(taskId, at("2026-10-12", "12:00"));
    expect((await getPending(taskId)).map((row) => row.dedupeKey)).toEqual([`recurring:${taskId}:2026-10-15:due`]);

    await db
      .update(schema.tasks)
      .set({ config: { mode: "weekdays", weekdays: [2], reminderTime: "18:00" } as never })
      .where(eq(schema.tasks.id, taskId));
    await rescheduleTask(taskId, at("2026-10-12", "12:05"));
    const pending = await getPending(taskId);
    expect(pending.map((row) => row.dedupeKey)).toEqual([`recurring:${taskId}:2026-10-13:due`]);
    expect(pending[0].dueAt).toEqual(at("2026-10-13", "18:00"));
  });


  it("cancels pending rows of a disabled task and keeps them pending without a notifier", async () => {
    const taskId = await insertTask("recurring", { everyDays: 3 });
    expect(await runTick(at("2026-10-01", "07:00"), { notifier: null })).toEqual({ sent: 0 });
    expect((await getPending(taskId)).length).toBeGreaterThan(0);

    await db.update(schema.tasks).set({ enabled: false }).where(eq(schema.tasks.id, taskId));
    await rescheduleTask(taskId, at("2026-10-01", "07:05"));
    expect(await getPending(taskId)).toEqual([]);
  });
});
