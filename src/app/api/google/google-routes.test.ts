// /api/google/* route handlers. Google's endpoints and the calendar module
// (owned by the engine) are mocked.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth";
import type { Db } from "@/server/db";
import { calendarEvents, tasks } from "@/server/db/schema";
import { createTestDb } from "@/server/db/testing";
import {
  createGoogleState,
  getGoogleConnection,
  saveGoogleConnection,
} from "@/server/google";

// after() needs a Next request scope; run the callback inline and keep the
// promise so tests can await it.
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

vi.mock("@/server/calendar", () => ({
  ensureToqueCalendar: vi.fn(async () => "cal-1"),
  syncAllCalendarEvents: vi.fn(async () => {}),
  deleteToqueCalendar: vi.fn(async () => {}),
}));

const calendar = await import("@/server/calendar");
const connectRoute = await import("./connect/route");
const callbackRoute = await import("./callback/route");
const statusRoute = await import("./status/route");
const disconnectRoute = await import("./disconnect/route");
const resyncRoute = await import("./resync/route");

let db: Db;
let cookie: string;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.stubEnv("TOQUE_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("TOQUE_PUBLIC_URL", "https://toque.example.pt");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.clearAllMocks();
  db = await createTestDb();
  cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken()}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function createRequest(path: string, method = "GET", withSession = true) {
  return new NextRequest(`https://toque.example.pt${path}`, {
    method,
    headers: withSession ? { cookie } : {},
  });
}

async function connectAccount() {
  await saveGoogleConnection(db, {
    accessToken: "at",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    refreshToken: "rt",
    scope: "openid email https://www.googleapis.com/auth/calendar.app.created",
    email: "eu@example.pt",
  });
}

describe("connect", () => {
  it("requires a session", async () => {
    const response = await connectRoute.GET(
      createRequest("/api/google/connect", "GET", false),
    );
    expect(response.status).toBe(401);
  });

  it("redirects to Google with a signed state and the public redirect URI", async () => {
    const response = await connectRoute.GET(
      createRequest("/api/google/connect"),
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://toque.example.pt/api/google/callback",
    );
    expect(location.searchParams.get("state")).toMatch(/^ey/);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sends the user back to settings when the server lacks Google config", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const response = await connectRoute.GET(
      createRequest("/api/google/connect"),
    );
    expect(response.headers.get("location")).toBe(
      "toque://definicoes?google=config",
    );
  });
});

describe("callback", () => {
  it("rejects a missing or forged state without calling Google", async () => {
    for (const query of ["?code=c", "?code=c&state=forged"]) {
      const response = await callbackRoute.GET(
        createRequest(`/api/google/callback${query}`, "GET", false),
      );
      expect(response.headers.get("location")).toBe(
        "toque://definicoes?google=erro",
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores the connection and creates the calendar", async () => {
    const idToken = [
      Buffer.from('{"alg":"none"}').toString("base64url"),
      Buffer.from('{"email":"eu@example.pt"}').toString("base64url"),
      "",
    ].join(".");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        access_token: "at",
        expires_in: 3600,
        refresh_token: "rt",
        scope:
          "openid https://www.googleapis.com/auth/calendar.app.created email",
        id_token: idToken,
      }),
    );
    const state = await createGoogleState();
    const response = await callbackRoute.GET(
      createRequest(`/api/google/callback?code=c&state=${state}`, "GET", false),
    );
    expect(response.headers.get("location")).toBe(
      "toque://definicoes?google=ok",
    );
    expect(calendar.ensureToqueCalendar).toHaveBeenCalledOnce();
    await Promise.all(afterTasks.splice(0));
    expect(calendar.syncAllCalendarEvents).toHaveBeenCalledOnce();
    expect((await getGoogleConnection(db))?.email).toBe("eu@example.pt");
  });

  it("still succeeds when the initial sync fails, recording the error", async () => {
    vi.mocked(calendar.syncAllCalendarEvents).mockRejectedValueOnce(
      new Error("Google 500"),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        access_token: "at",
        expires_in: 3600,
        refresh_token: "rt",
        scope:
          "openid email https://www.googleapis.com/auth/calendar.app.created",
        id_token: [
          Buffer.from('{"alg":"none"}').toString("base64url"),
          Buffer.from('{"email":"eu@example.pt"}').toString("base64url"),
          "",
        ].join("."),
      }),
    );
    const state = await createGoogleState();
    const response = await callbackRoute.GET(
      createRequest(`/api/google/callback?code=c&state=${state}`, "GET", false),
    );
    expect(response.headers.get("location")).toContain("google=ok");
    await Promise.all(afterTasks.splice(0));
    expect((await getGoogleConnection(db))?.lastError).toMatch(
      /primeira sincronização falhou/,
    );
  });

  it("refuses a consent without the calendar scope", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        access_token: "at",
        expires_in: 3600,
        refresh_token: "rt",
        scope: "openid email",
      }),
    );
    const state = await createGoogleState();
    const response = await callbackRoute.GET(
      createRequest(`/api/google/callback?code=c&state=${state}`, "GET", false),
    );
    expect(response.headers.get("location")).toContain("google=erro");
    expect(await getGoogleConnection(db)).toBeNull();
  });
});

describe("status, resync and disconnect", () => {
  it("reports the connection", async () => {
    const empty = await (
      await statusRoute.GET(createRequest("/api/google/status"))
    ).json();
    expect(empty).toEqual({
      demo: false,
      demoResetAt: null,
      configured: true,
      connected: false,
      email: null,
      calendarName: null,
      lastError: null,
      lastSyncAt: null,
    });
    await connectAccount();
    const status = await (
      await statusRoute.GET(createRequest("/api/google/status"))
    ).json();
    expect(status).toMatchObject({ connected: true, email: "eu@example.pt" });
    expect(
      (await statusRoute.GET(createRequest("/api/google/status", "GET", false)))
        .status,
    ).toBe(401);
  });

  it("resyncs only when connected", async () => {
    expect(
      (await resyncRoute.POST(createRequest("/api/google/resync", "POST")))
        .status,
    ).toBe(409);
    await connectAccount();
    const response = await resyncRoute.POST(
      createRequest("/api/google/resync", "POST"),
    );
    expect(response.status).toBe(200);
    expect(calendar.syncAllCalendarEvents).toHaveBeenCalledOnce();
  });

  it("deletes the calendar, revokes the token and forgets everything", async () => {
    await connectAccount();
    const [task] = await db
      .insert(tasks)
      .values({
        name: "T",
        kind: "recurring",
        config: { mode: "interval", everyDays: 1, reminderTime: "09:00" },
      })
      .returning();
    await db.insert(calendarEvents).values({
      taskId: task.id,
      occurrenceKey: "k",
      start: new Date(),
      end: new Date(),
      contentHash: "h",
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await disconnectRoute.POST(
      createRequest("/api/google/disconnect", "POST"),
    );
    expect(await response.json()).toMatchObject({
      connected: false,
      email: null,
    });
    expect(calendar.deleteToqueCalendar).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
    expect(await getGoogleConnection(db)).toBeNull();
    expect(await db.select().from(calendarEvents)).toHaveLength(0);
  });
});
