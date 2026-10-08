import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type Db } from "./index";
import {
  events,
  notifications,
  settings,
  tags,
  tasks,
  taskState,
} from "./schema";
import { createTestDb } from "./testing";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
});

async function insertTask() {
  const [task] = await db
    .insert(tasks)
    .values({
      name: "Máquina",
      kind: "timer",
      config: {
        durationMinutes: 60,
        almostDoneEnabled: true,
        almostDoneMinutes: 10,
        forgottenRemindersEnabled: false,
        forgottenReminderMinutes: [15],
      },
    })
    .returning();
  return task;
}

describe("schema", () => {
  it("applies migrations and round-trips a task with jsonb config", async () => {
    const task = await insertTask();
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.enabled).toBe(true);
    const [loaded] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(loaded.config).toMatchObject({
      durationMinutes: 60,
      forgottenReminderMinutes: [15],
    });
  });

  it("rejects duplicate tag tokens", async () => {
    await db.insert(tags).values({ token: "a".repeat(24), label: "A" });
    await expect(
      db.insert(tags).values({ token: "a".repeat(24), label: "B" }),
    ).rejects.toThrow();
  });

  it("unassigns tags and keeps events when a task is deleted, but drops its state and notifications", async () => {
    const task = await insertTask();
    const [tag] = await db
      .insert(tags)
      .values({ token: "t".repeat(24), label: "T", taskId: task.id })
      .returning();
    await db
      .insert(events)
      .values({ type: "scan", taskId: task.id, tagId: tag.id });
    await db
      .insert(taskState)
      .values({ taskId: task.id, lastDoneAt: new Date() });
    await db.insert(notifications).values({
      taskId: task.id,
      kind: "timer_finished",
      dueAt: new Date(),
      payload: { title: "x", message: "y", priority: 3, tags: [], actions: [] },
    });

    await db.delete(tasks).where(eq(tasks.id, task.id));

    expect((await db.select().from(tags))[0].taskId).toBeNull();
    expect((await db.select().from(events))[0].taskId).toBeNull();
    expect(await db.select().from(taskState)).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("deduplicates notifications by dedupe_key", async () => {
    const values = {
      kind: "until_ack_reminder" as const,
      dueAt: new Date(),
      dedupeKey: "until_ack:x:2026-10-09:08:00",
      payload: { title: "x", message: "y", priority: 3, tags: [], actions: [] },
    };
    await db.insert(notifications).values(values);
    await db.insert(notifications).values(values).onConflictDoNothing();
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("allows only one settings row", async () => {
    await db.insert(settings).values({ data: {} });
    await expect(
      db.insert(settings).values({ id: 2, data: {} }),
    ).rejects.toThrow();
  });
});
