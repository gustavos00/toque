// GET /api/reminders/upcoming against an in-memory PGlite (real engine plan).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/server/auth";
import { createTestDb } from "@/server/db/testing";
import { tasks } from "@/server/db/schema";
import { verifyActionToken } from "@/server/notify";
import { untilAckConfigSchema } from "@/shared/tasks";

const route = await import("./upcoming/route");

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("TOQUE_ACTION_SECRET", "a-secret-with-16-chars-or-more");
  await createTestDb();
});

function createRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

async function createBearer() {
  return { authorization: `Bearer ${await createSessionToken()}` };
}

describe("GET /api/reminders/upcoming", () => {
  it("requires a session", async () => {
    const response = await route.GET(createRequest("/api/reminders/upcoming"));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid limit", async () => {
    const headers = await createBearer();
    for (const limit of ["0", "65", "abc"]) {
      const response = await route.GET(
        createRequest(`/api/reminders/upcoming?limit=${limit}`, headers),
      );
      expect(response.status).toBe(400);
    }
  });

  it("returns an empty list with no tasks", async () => {
    const response = await route.GET(
      createRequest("/api/reminders/upcoming", await createBearer()),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reminders: [] });
  });

  it("lists future reminders nearest first, with signed Feito/Adiar URLs", async () => {
    const db = await createTestDb();
    await db.insert(tasks).values({
      name: "Regar plantas",
      kind: "until_ack",
      config: untilAckConfigSchema.parse({
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        reminderTimes: ["08:00", "20:00"],
      }),
    });
    const headers = await createBearer();
    const response = await route.GET(
      createRequest("/api/reminders/upcoming?limit=5", headers),
    );
    const { reminders } = await response.json();
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.length).toBeLessThanOrEqual(5);
    const times = reminders.map((r: { dueAt: string }) => r.dueAt);
    expect([...times].sort()).toEqual(times);
    for (const r of reminders) {
      expect(new Date(r.dueAt).getTime()).toBeGreaterThan(Date.now());
      expect(r.taskName).toBe("Regar plantas");
    }
    const done = new URL(reminders[0].doneUrl);
    expect(done.origin).toBe("http://localhost");
    expect(done.pathname).toBe("/api/actions/done");
    const verified = verifyActionToken(
      {
        action: "done",
        taskId: done.searchParams.get("task") ?? "",
        occurrence: done.searchParams.get("occ") ?? "",
        exp: done.searchParams.get("exp") ?? "",
        sig: done.searchParams.get("sig") ?? "",
      },
      new Date(reminders[0].dueAt),
    );
    expect(verified.ok).toBe(true);
  });

  it("omits action URLs without a signing secret", async () => {
    vi.stubEnv("TOQUE_ACTION_SECRET", "");
    const db = await createTestDb();
    await db.insert(tasks).values({
      name: "Regar",
      kind: "until_ack",
      config: untilAckConfigSchema.parse({
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        reminderTimes: ["08:00", "20:00"],
      }),
    });
    const response = await route.GET(
      createRequest("/api/reminders/upcoming", await createBearer()),
    );
    const { reminders } = await response.json();
    expect(reminders[0].doneUrl).toBeNull();
    expect(reminders[0].snoozeUrl).toBeNull();
  });
});
