// Public demo mode (NEXT_PUBLIC_TOQUE_DEMO=1): Google and ntfy blocked on the
// server, no device details stored, periodic data wipe, zero secrets.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth";
import { getSessionKey } from "@/server/auth/session";
import type { Db } from "@/server/db";
import { maybeResetDemoData, getNextDemoResetAt } from "@/server/db/demo";
import { buildEventDto, getSettings, saveSettings } from "@/server/db/queries";
import {
  demoState,
  events,
  settings,
  tags,
  tasks,
  taskState,
} from "@/server/db/schema";
import { createTestDb } from "@/server/db/testing";
import { getGoogleAccessToken, saveGoogleConnection } from "@/server/google";
import { mergeSettings } from "@/shared/settings";

// connection() needs a Next request scope.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/server/engine", () => ({
  handleScan: vi.fn(async () => ({ title: "x", message: "y", tone: "info" })),
  rescheduleAllTasks: vi.fn(async () => {}),
}));
vi.mock("@/server/calendar", () => ({
  ensureToqueCalendar: vi.fn(async () => "cal"),
  syncAllCalendarEvents: vi.fn(async () => {}),
  deleteToqueCalendar: vi.fn(async () => {}),
}));

const connectRoute = await import("./google/connect/route");
const callbackRoute = await import("./google/callback/route");
const statusRoute = await import("./google/status/route");
const disconnectRoute = await import("./google/disconnect/route");
const resyncRoute = await import("./google/resync/route");
const settingsRoute = await import("./settings/route");
const appInfoRoute = await import("./app-info/route");
const tasksRoute = await import("./tasks/route");
const scanRoute = await import("./scan/[token]/route");

const fetchMock = vi.fn();
let db: Db;
let cookie: string;

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "1");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("TOQUE_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  db = await createTestDb();
  cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken()}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function createRequest(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return new NextRequest(`https://demo.example.pt${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie,
      ...(init.body !== undefined && { "content-type": "application/json" }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("session secret", () => {
  it("falls back to a built-in key on the demo, even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOQUE_SESSION_SECRET", "");
    expect(getSessionKey().length).toBeGreaterThanOrEqual(32);
    expect(await createSessionToken()).toMatch(/^ey/);
  });

  it("stays strict in production outside the demo", () => {
    vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOQUE_SESSION_SECRET", "");
    expect(() => getSessionKey()).toThrow(/TOQUE_SESSION_SECRET/);
  });
});

describe("Google is blocked", () => {
  it("redirects connect and callback to ?google=demo without calling Google", async () => {
    const connect = await connectRoute.GET(
      createRequest("/api/google/connect"),
    );
    expect(connect.headers.get("location")).toBe(
      "toque://definicoes?google=demo",
    );
    const callback = await callbackRoute.GET(
      createRequest("/api/google/callback?code=c&state=s", {
        headers: { cookie: "" },
      }),
    );
    expect(callback.headers.get("location")).toBe(
      "toque://definicoes?google=demo",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses resync and disconnect with 403", async () => {
    for (const route of [resyncRoute, disconnectRoute]) {
      const response = await route.POST(
        createRequest("/api/google/x", { method: "POST" }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Indisponível na demonstração",
      });
    }
  });

  it("reports an empty, unconfigured status", async () => {
    const status = await (
      await statusRoute.GET(createRequest("/api/google/status"))
    ).json();
    expect(new Date(status.demoResetAt).getTime()).toBeGreaterThan(Date.now());
    expect({ ...status, demoResetAt: "x" }).toEqual({
      demo: true,
      demoResetAt: "x",
      configured: false,
      connected: false,
      email: null,
      calendarName: null,
      lastError: null,
      lastSyncAt: null,
    });
  });

  it("never stores or reads tokens, even if called directly", async () => {
    await expect(
      saveGoogleConnection(db, {
        accessToken: "a",
        accessTokenExpiresAt: new Date(),
        refreshToken: "r",
        scope: "",
        email: "x@example.pt",
      }),
    ).rejects.toMatchObject({ code: "not_configured" });
    await expect(getGoogleAccessToken({ db })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("ntfy is blocked", () => {
  it("hides the topic and refuses ntfy changes, keeping other settings editable", async () => {
    await db.insert(settings).values({
      data: mergeSettings({}, { ntfy: { topic: "secret-topic" } }),
    });
    const current = await (
      await settingsRoute.GET(createRequest("/api/settings"))
    ).json();
    expect(current.ntfy.topic).toBeNull();

    const blocked = await settingsRoute.PATCH(
      createRequest("/api/settings", {
        method: "PATCH",
        body: { ntfy: { topic: "mine" } },
      }),
    );
    expect(blocked.status).toBe(403);

    const allowed = await settingsRoute.PATCH(
      createRequest("/api/settings", {
        method: "PATCH",
        body: { quietHours: { start: "22:00" } },
      }),
    );
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).quietHours.start).toBe("22:00");
    // Saving also drops any stored topic.
    const [row] = await db.select().from(settings);
    expect(JSON.stringify(row.data)).not.toContain("secret-topic");
  });

  it("never saves a topic through the data layer", async () => {
    await saveSettings(db, mergeSettings({}, { ntfy: { topic: "abc" } }));
    expect((await getSettings(db)).ntfy.topic).toBeNull();
  });
});

describe("no device details", () => {
  it("does not store the scan user agent", async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        name: "T",
        kind: "timer",
        config: { durationMinutes: 30 } as never,
      })
      .returning();
    const [tag] = await db
      .insert(tags)
      .values({ token: "d".repeat(24), label: "T", taskId: task.id })
      .returning();
    await scanRoute.POST(
      new NextRequest(`https://demo.example.pt/api/scan/${tag.token}`, {
        method: "POST",
        headers: { "user-agent": "Mozilla/5.0 (iPhone)" },
      }),
      { params: Promise.resolve({ token: tag.token }) },
    );
    const [scan] = await db.select().from(events);
    expect(scan.data).toEqual({ action: "start" });
  });

  it("strips a stored user agent from history", () => {
    const dto = buildEventDto(
      {
        id: 1,
        at: new Date(),
        type: "scan",
        taskId: null,
        tagId: null,
        data: { action: "start", userAgent: "x" },
      },
      null,
    );
    expect(dto.data).toEqual({ action: "start" });
  });
});

describe("app info", () => {
  it("reports demo mode and the next wipe", async () => {
    const info = await (await appInfoRoute.GET()).json();
    expect(info.demo).toBe(true);
    expect(new Date(info.demoResetAt).getTime()).toBeGreaterThan(Date.now());

    vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "");
    expect(await (await appInfoRoute.GET()).json()).toEqual({
      demo: false,
      demoResetAt: null,
    });
  });
});

describe("periodic wipe", () => {
  const start = new Date("2026-10-09T10:00:00Z");
  const minutes = (count: number) => new Date(start.getTime() + count * 60_000);

  async function seedData() {
    const [task] = await db
      .insert(tasks)
      .values({
        name: "T",
        kind: "timer",
        config: { durationMinutes: 30 } as never,
      })
      .returning();
    await db
      .insert(tags)
      .values({ token: "w".repeat(24), label: "T", taskId: task.id });
    await db.insert(taskState).values({ taskId: task.id, lastDoneAt: start });
    await db.insert(events).values({ type: "scan", taskId: task.id });
    await db.insert(settings).values({ data: mergeSettings({}) });
  }

  async function countRows() {
    return (
      await Promise.all(
        [tasks, tags, taskState, events, settings].map((table) =>
          db.select().from(table),
        ),
      )
    ).map((rows) => rows.length);
  }

  it("wipes after 5 minutes, not before", async () => {
    expect(await maybeResetDemoData(db, start)).toBe(false); // starts the clock
    await seedData();
    expect(await maybeResetDemoData(db, minutes(4))).toBe(false);
    expect(await countRows()).toEqual([1, 1, 1, 1, 1]);
    expect((await getNextDemoResetAt(db, minutes(4)))?.toISOString()).toBe(
      minutes(5).toISOString(),
    );

    expect(await maybeResetDemoData(db, minutes(5))).toBe(true);
    expect(await countRows()).toEqual([0, 0, 0, 0, 0]);
    expect((await getNextDemoResetAt(db, minutes(6)))?.toISOString()).toBe(
      minutes(10).toISOString(),
    );
  });

  it("lets only one concurrent caller wipe", async () => {
    await db.insert(demoState).values({ id: 1, lastResetAt: start });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => maybeResetDemoData(db, minutes(6))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("runs from protected routes", async () => {
    await db
      .insert(demoState)
      .values({ id: 1, lastResetAt: new Date(Date.now() - 10 * 60_000) });
    await seedData();
    const list = await (
      await tasksRoute.GET(createRequest("/api/tasks"))
    ).json();
    expect(list).toEqual([]);
  });

  it("is a no-op outside demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "");
    await db.insert(demoState).values({ id: 1, lastResetAt: minutes(-60) });
    await seedData();
    expect(await maybeResetDemoData(db, start)).toBe(false);
    expect(await countRows()).toEqual([1, 1, 1, 1, 1]);
    expect(await getNextDemoResetAt(db, start)).toBeNull();
  });
});
