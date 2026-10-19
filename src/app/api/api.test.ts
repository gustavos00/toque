// Route handler tests against an in-memory PGlite. The engine is mocked: its
// behaviour is tested by the engine's own suite.

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth";
import { type Db } from "@/server/db";
import { events, tags, taskState } from "@/server/db/schema";
import { createTestDb } from "@/server/db/testing";
import type { DashboardDto, EventListDto, TagDto, TaskDto } from "@/shared/api";

vi.mock("@/server/engine", () => ({
  handleScan: vi.fn(async () => ({
    title: "Máquina",
    message: "Acaba às 15:40",
    tone: "started",
  })),
  runTick: vi.fn(async () => ({ sent: 2 })),
  rescheduleTask: vi.fn(async () => {}),
  rescheduleAllTasks: vi.fn(async () => {}),
  handleTaskDone: vi.fn(async () => ({
    title: "x",
    message: "Tratado",
    tone: "done",
  })),
  handleTaskSnooze: vi.fn(async () => ({
    title: "x",
    message: "Adiado",
    tone: "info",
  })),
  handleNotificationAction: vi.fn(async () => ({
    ok: false,
    status: 403,
    reason: "bad_signature",
  })),
}));

const engine = await import("@/server/engine");
const tasksRoute = await import("./tasks/route");
const taskRoute = await import("./tasks/[id]/route");
const tagsRoute = await import("./tags/route");
const tagRoute = await import("./tags/[id]/route");
const settingsRoute = await import("./settings/route");
const eventsRoute = await import("./events/route");
const dashboardRoute = await import("./dashboard/route");
const tickRoute = await import("./tick/route");
const loginRoute = await import("./auth/login/route");
const logoutRoute = await import("./auth/logout/route");
const scanRoute = await import("./scan/[token]/route");
const tagPageRoute = await import("../t/[token]/route");

let db: Db;
let cookie: string;

beforeEach(async () => {
  db = await createTestDb();
  cookie = `${SESSION_COOKIE_NAME}=${await createSessionToken()}`;
  vi.clearAllMocks();
});

function createRequest(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { cookie, ...init.headers };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function createContext<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

async function createTask(
  body: unknown = {
    name: "Máquina",
    kind: "timer",
    config: { durationMinutes: 90 },
  },
) {
  const response = await tasksRoute.POST(
    createRequest("/api/tasks", { method: "POST", body }),
  );
  return { response, task: (await response.json()) as TaskDto };
}

async function createTag(body: unknown) {
  const response = await tagsRoute.POST(
    createRequest("/api/tags", { method: "POST", body }),
  );
  return { response, tag: (await response.json()) as TagDto };
}

describe("auth", () => {
  it("rejects API calls without a session", async () => {
    const response = await tasksRoute.GET(
      createRequest("/api/tasks", { headers: { cookie: "" } }),
    );
    expect(response.status).toBe(401);
  });

  it("logs in with JSON and sets the cookie", async () => {
    vi.stubEnv("TOQUE_PASSWORD", "segredo");
    const ok = await loginRoute.POST(
      createRequest("/api/auth/login", {
        method: "POST",
        body: { password: "segredo" },
        headers: { cookie: "" },
      }),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(
      new RegExp(`^${SESSION_COOKIE_NAME}=.+HttpOnly`, "i"),
    );
    const { token } = await ok.json();
    expect(token).toEqual(expect.any(String));
    const withBearer = await tasksRoute.GET(
      createRequest("/api/tasks", {
        headers: { cookie: "", authorization: `Bearer ${token}` },
      }),
    );
    expect(withBearer.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it("logs out by clearing the cookie", async () => {
    const response = await logoutRoute.POST(
      createRequest("/api/auth/logout", { method: "POST" }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });
});

describe("tasks", () => {
  it("creates with defaults, lists, updates and deletes", async () => {
    const { response, task } = await createTask();
    expect(response.status).toBe(201);
    expect(task).toMatchObject({
      name: "Máquina",
      kind: "timer",
      enabled: true,
      state: null,
    });
    expect(task.config).toMatchObject({
      durationMinutes: 90,
      forgottenRemindersEnabled: true,
    });
    expect(engine.rescheduleTask).toHaveBeenCalledWith(
      task.id,
      expect.any(Date),
    );

    const list = (await (
      await tasksRoute.GET(createRequest("/api/tasks"))
    ).json()) as TaskDto[];
    expect(list.map((item) => item.id)).toEqual([task.id]);

    const patched = await taskRoute.PATCH(
      createRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { name: "Máquina da roupa", config: { durationMinutes: 60 } },
      }),
      createContext({ id: task.id }),
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      name: "Máquina da roupa",
      config: { durationMinutes: 60 },
    });

    const deleted = await taskRoute.DELETE(
      createRequest(`/api/tasks/${task.id}`, { method: "DELETE" }),
      createContext({ id: task.id }),
    );
    expect(deleted.status).toBe(204);
    const missing = await taskRoute.GET(
      createRequest(`/api/tasks/${task.id}`),
      createContext({ id: task.id }),
    );
    expect(missing.status).toBe(404);
  });

  it("validates config per kind, including kind changes", async () => {
    const { response } = await createTask({
      name: "Lixo",
      kind: "until_ack",
      config: {},
    });
    expect(response.status).toBe(400);

    const { task } = await createTask();
    const changed = await taskRoute.PATCH(
      createRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { kind: "recurring" },
      }),
      createContext({ id: task.id }),
    );
    expect(changed.status).toBe(400);
    const ok = await taskRoute.PATCH(
      createRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { kind: "recurring", config: { everyDays: 14 } },
      }),
      createContext({ id: task.id }),
    );
    expect(await ok.json()).toMatchObject({
      kind: "recurring",
      config: { everyDays: 14, reminderTime: "09:00" },
    });
  });

  it("returns 404 for malformed ids", async () => {
    const response = await taskRoute.GET(
      createRequest("/api/tasks/nope"),
      createContext({ id: "nope" }),
    );
    expect(response.status).toBe(404);
  });
});

describe("tags", () => {
  it("creates tags with a long random token and URL, reassigns and deletes", async () => {
    vi.stubEnv("TOQUE_PUBLIC_URL", "https://toque.example.pt/");
    const { task } = await createTask();
    const { response, tag } = await createTag({
      label: "Máquina",
      taskId: task.id,
    });
    expect(response.status).toBe(201);
    expect(tag.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(tag.url).toBe(`https://toque.example.pt/t/${tag.token}`);
    expect(tag.action).toBe("start");

    const detail = (await (
      await taskRoute.GET(
        createRequest(`/api/tasks/${task.id}`),
        createContext({ id: task.id }),
      )
    ).json()) as TaskDto;
    expect(detail.tags).toEqual([
      { id: tag.id, label: "Máquina", action: "start" },
    ]);

    const { tag: other } = await createTag({
      label: "Estendal",
      taskId: task.id,
      action: "complete",
    });
    expect(other.token).not.toBe(tag.token);
    expect(other.action).toBe("complete");

    const list = (await (
      await tasksRoute.GET(createRequest("/api/tasks"))
    ).json()) as TaskDto[];
    expect(list[0].tags.map((item) => [item.label, item.action])).toEqual([
      ["Estendal", "complete"],
      ["Máquina", "start"],
    ]);

    const unassigned = await tagRoute.PATCH(
      createRequest(`/api/tags/${tag.id}`, {
        method: "PATCH",
        body: { taskId: null },
      }),
      createContext({ id: tag.id }),
    );
    expect(await unassigned.json()).toMatchObject({
      taskId: null,
      label: "Máquina",
    });

    const unchanged = await tagRoute.PATCH(
      createRequest(`/api/tags/${tag.id}`, { method: "PATCH", body: {} }),
      createContext({ id: tag.id }),
    );
    expect(unchanged.status).toBe(200);

    const deleted = await tagRoute.DELETE(
      createRequest(`/api/tags/${tag.id}`, { method: "DELETE" }),
      createContext({ id: tag.id }),
    );
    expect(deleted.status).toBe(204);
    vi.unstubAllEnvs();
  });

  it("falls back to the request origin and rejects unknown tasks", async () => {
    const { tag } = await createTag({ label: "Solta" });
    expect(tag.url).toBe(`http://localhost/t/${tag.token}`);
    const { response } = await createTag({
      label: "X",
      taskId: "00000000-0000-4000-8000-000000000000",
    });
    expect(response.status).toBe(400);
  });
});

describe("scan /api/scan/:token", () => {
  const post = (token: string, body?: unknown) =>
    scanRoute.POST(
      new NextRequest(`http://localhost/api/scan/${token}`, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      createContext({ token }),
    );

  it("records the scan without a session and returns the engine's message", async () => {
    const { task } = await createTask();
    const { tag } = await createTag({
      label: "Estendal",
      taskId: task.id,
      action: "complete",
    });

    const response = await post(tag.token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: "Acaba às 15:40" });
    expect(engine.handleScan).toHaveBeenCalledWith({
      taskId: task.id,
      tagId: tag.id,
      action: "complete",
      now: expect.any(Date),
    });

    const [scan] = await db
      .select()
      .from(events)
      .where(eq(events.type, "scan"));
    expect(scan).toMatchObject({
      taskId: task.id,
      tagId: tag.id,
      data: { action: "complete" },
    });
    const [stored] = await db.select().from(tags);
    expect(stored.lastScannedAt).not.toBeNull();
  });

  it("describes the tag on GET without recording anything", async () => {
    const { task } = await createTask();
    const { tag } = await createTag({ label: "Estendal", taskId: task.id });
    const response = await scanRoute.GET(
      new NextRequest(`http://localhost/api/scan/${tag.token}`),
      createContext({ token: tag.token }),
    );
    expect(await response.json()).toEqual({
      tagLabel: "Estendal",
      taskName: "Máquina",
      canScan: true,
    });
    expect(engine.handleScan).not.toHaveBeenCalled();
    expect(
      await db.select().from(events).where(eq(events.type, "scan")),
    ).toHaveLength(0);
  });

  it("snoozes the tag's task without logging a scan", async () => {
    const { task } = await createTask();
    const { tag } = await createTag({ label: "T", taskId: task.id });
    const response = await post(tag.token, { action: "snooze" });
    expect(await response.json()).toMatchObject({ message: "Adiado" });
    expect(engine.handleTaskSnooze).toHaveBeenCalledWith(
      task.id,
      expect.any(Date),
    );
    expect(engine.handleScan).not.toHaveBeenCalled();
    expect(
      await db.select().from(events).where(eq(events.type, "scan")),
    ).toHaveLength(0);
  });

  it("answers 404 for unknown tokens, a hint for unassigned tags, 400 for bad actions", async () => {
    const unknown = await post("x".repeat(24));
    expect(unknown.status).toBe(404);
    const info = await scanRoute.GET(
      new NextRequest("http://localhost/api/scan/x"),
      createContext({ token: "x".repeat(24) }),
    );
    expect(info.status).toBe(404);

    const { tag } = await createTag({ label: "Solta" });
    const loose = await post(tag.token);
    expect((await loose.json()).message).toContain("ainda não está associada");
    expect(engine.handleScan).not.toHaveBeenCalled();
    expect((await post(tag.token, { action: "nope" })).status).toBe(400);
  });
});

describe("tag page /t/:token", () => {
  it("shows the open-the-app page and records nothing", async () => {
    const { task } = await createTask();
    const { tag } = await createTag({ label: "T", taskId: task.id });
    const response = await tagPageRoute.GET(
      new NextRequest(`http://localhost/t/${tag.token}`),
      createContext({ token: tag.token }),
    );
    const html = await response.text();
    expect(html).toContain("Abre a app Toque");
    expect(html).toContain(`toque://t/${tag.token}`);
    expect(engine.handleScan).not.toHaveBeenCalled();
    expect(
      await db.select().from(events).where(eq(events.type, "scan")),
    ).toHaveLength(0);
  });
});

describe("settings", () => {
  it("returns defaults and merges partial patches", async () => {
    const initial = await (
      await settingsRoute.GET(createRequest("/api/settings"))
    ).json();
    expect(initial.quietHours).toEqual({
      enabled: true,
      start: "23:00",
      end: "07:30",
    });

    const patched = await settingsRoute.PATCH(
      createRequest("/api/settings", {
        method: "PATCH",
        body: { ntfy: { topic: "casa-123" }, quietHours: { start: "22:00" } },
      }),
    );
    expect(patched.status).toBe(200);
    const saved = await (
      await settingsRoute.GET(createRequest("/api/settings"))
    ).json();
    expect(saved.ntfy.topic).toBe("casa-123");
    expect(saved.quietHours).toEqual({
      enabled: true,
      start: "22:00",
      end: "07:30",
    });
    expect(engine.rescheduleAllTasks).toHaveBeenCalled();

    const bad = await settingsRoute.PATCH(
      createRequest("/api/settings", {
        method: "PATCH",
        body: { quietHours: { start: "9h" } },
      }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("events and dashboard", () => {
  it("pages history newest first", async () => {
    const { task } = await createTask();
    await db.insert(events).values([
      { type: "scan", taskId: task.id },
      { type: "timer_started", taskId: task.id },
    ]);

    const first = (await (
      await eventsRoute.GET(createRequest("/api/events?limit=2"))
    ).json()) as EventListDto;
    expect(first.events.map((event) => event.type)).toEqual([
      "timer_started",
      "scan",
    ]);
    expect(first.events[0].taskName).toBe("Máquina");
    expect(first.nextBeforeId).not.toBeNull();

    const second = (await (
      await eventsRoute.GET(
        createRequest(`/api/events?limit=2&beforeId=${first.nextBeforeId}`),
      )
    ).json()) as EventListDto;
    expect(second.events.map((event) => event.type)).toEqual(["task_created"]);
    expect(second.nextBeforeId).toBeNull();
  });

  it("summarises timers, until_ack and recurring tasks", async () => {
    const { task: timer } = await createTask();
    const { task: ready } = await createTask({
      name: "Secadora",
      kind: "timer",
      config: { durationMinutes: 30 },
    });
    const { task: rubbish } = await createTask({
      name: "Lixo",
      kind: "until_ack",
      config: { weekdays: [1, 2, 3, 4, 5, 6, 7] },
    });
    const { task: plants } = await createTask({
      name: "Plantas",
      kind: "recurring",
      config: { everyDays: 3 },
    });
    const now = Date.now();
    await db.insert(taskState).values([
      {
        taskId: timer.id,
        timerStartedAt: new Date(now - 60_000),
        timerEndsAt: new Date(now + 3_600_000),
      },
      {
        taskId: ready.id,
        timerStartedAt: new Date(now - 7_200_000),
        timerEndsAt: new Date(now - 60_000),
      },
      { taskId: plants.id, lastDoneAt: new Date(now - 10 * 86_400_000) },
    ]);

    const dashboard = (await (
      await dashboardRoute.GET(createRequest("/api/dashboard"))
    ).json()) as DashboardDto;
    expect(
      dashboard.timers.map((item) => [item.task.name, item.phase]),
    ).toEqual([
      ["Secadora", "ready"],
      ["Máquina", "running"],
    ]);
    expect(dashboard.untilAckToday).toEqual([
      expect.objectContaining({
        acked: false,
        task: expect.objectContaining({ id: rubbish.id }),
      }),
    ]);
    expect(dashboard.recurring).toEqual([
      expect.objectContaining({ overdue: true }),
    ]);
    expect(dashboard.recentEvents.length).toBeGreaterThan(0);
  });
});

describe("tick", () => {
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("TOQUE_CRON_SECRET", "cron-secret");
    const denied = await tickRoute.GET(
      createRequest("/api/tick", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(denied.status).toBe(401);
    const ok = await tickRoute.POST(
      createRequest("/api/tick", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sent: 2 });
    expect(engine.runTick).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("is unavailable without a configured secret", async () => {
    vi.stubEnv("TOQUE_CRON_SECRET", "");
    const response = await tickRoute.GET(
      createRequest("/api/tick", { headers: { authorization: "Bearer " } }),
    );
    expect(response.status).toBe(503);
    vi.unstubAllEnvs();
  });
});
