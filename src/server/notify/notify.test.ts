import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestSettings } from "@/server/engine/test-fixtures";
import { createActionUrl, readSignedActionParams, verifyActionToken } from "./action-token";
import { buildOutgoingNotification, createNotifierFromSettings } from "./index";
import { createNtfyNotifier } from "./ntfy";

const SECRET = "test-secret-0123456789abcdef";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-09T14:00:00Z");

function readParams(url: string) {
  const parsed = new URL(url);
  return readSignedActionParams(parsed, parsed.pathname.split("/").pop() ?? "");
}

describe("action tokens", () => {
  const url = createActionUrl({
    baseUrl: "https://toque.example.pt",
    action: "done",
    taskId: TASK_ID,
    occurrence: "2026-10-09",
    expiresAt: new Date(NOW.getTime() + 3600_000),
    secret: SECRET,
  });

  it("builds a signed /api/actions URL that verifies", () => {
    expect(url).toMatch(/^https:\/\/toque\.example\.pt\/api\/actions\/done\?task=.+&exp=\d+&sig=[\w-]+$/);
    expect(url).toContain("occ=2026-10-09");
    expect(verifyActionToken(readParams(url), NOW, SECRET)).toEqual({
      ok: true,
      action: "done",
      taskId: TASK_ID,
      occurrence: "2026-10-09",
    });
  });

  it("rejects tampering, another action, expiry and a missing secret", () => {
    const params = readParams(url);
    expect(verifyActionToken({ ...params, taskId: "other" }, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyActionToken({ ...params, action: "snooze" }, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyActionToken({ ...params, action: "delete" }, NOW, SECRET)).toEqual({ ok: false, reason: "bad_action" });
    expect(verifyActionToken(params, new Date(NOW.getTime() + 2 * 3600_000), SECRET)).toEqual({ ok: false, reason: "expired" });
    expect(verifyActionToken(params, NOW, "another-secret-0123456789")).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyActionToken(params, NOW, null)).toEqual({ ok: false, reason: "no_secret" });
    expect(verifyActionToken({ ...params, exp: "abc" }, NOW, SECRET)).toEqual({ ok: false, reason: "malformed" });
    // The occurrence is signed: moving a link to another day fails, and v1 links (no occ) are refused.
    expect(verifyActionToken({ ...params, occurrence: "2026-10-10" }, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyActionToken({ ...params, occurrence: "" }, NOW, SECRET)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("createNotifierFromSettings", () => {
  const settings = createTestSettings();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function getPublishUrl(value: typeof settings) {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createNotifierFromSettings(value)?.send({ title: "t", message: "m", priority: 3, tags: [], clickUrl: null, buttons: [] });
    vi.unstubAllGlobals();
    const call = fetchMock.mock.calls[0];
    return call ? { url: call[0], topic: JSON.parse(String(call[1]?.body)).topic } : null;
  }

  it("is null without any topic", async () => {
    vi.stubEnv("NTFY_TOPIC", "");
    expect(createNotifierFromSettings(settings)).toBeNull();
  });

  it("falls back to env vars when settings are not set", async () => {
    vi.stubEnv("NTFY_TOPIC", "env-topic");
    vi.stubEnv("NTFY_BASE_URL", "https://ntfy.env.example");
    expect(await getPublishUrl(settings)).toEqual({ url: "https://ntfy.env.example", topic: "env-topic" });
  });

  it("prefers settings over env vars", async () => {
    vi.stubEnv("NTFY_TOPIC", "env-topic");
    vi.stubEnv("NTFY_BASE_URL", "https://ntfy.env.example");
    const custom = { ...settings, ntfy: { server: "https://ntfy.mine.example", topic: "my-topic" } };
    expect(await getPublishUrl(custom)).toEqual({ url: "https://ntfy.mine.example", topic: "my-topic" });
  });
});

describe("ntfy adapter", () => {
  const notification = buildOutgoingNotification({
    kind: "until_ack_reminder",
    payload: { title: "Lixo", message: "Hoje é o dia.", priority: 4, tags: ["bell"], actions: ["done", "snooze", "open"] },
    taskId: TASK_ID,
    occurrence: "2026-10-09",
    now: NOW,
    snoozeMinutes: 60,
    baseUrl: "https://toque.example.pt",
    secret: SECRET,
  });

  it("publishes JSON with title, priority, click and http action buttons", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    await createNtfyNotifier({ baseUrl: "https://ntfy.sh/", topic: "segredo", token: "tk", fetch: fetchMock }).send(notification);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.sh");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tk");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ topic: "segredo", title: "Lixo", message: "Hoje é o dia.", priority: 4, tags: ["bell"], click: "https://toque.example.pt/" });
    expect(body.actions.map((a: { label: string }) => a.label)).toEqual(["Feito", "Adiar 1 h"]);
    expect(body.actions[0]).toMatchObject({ action: "http", method: "POST", clear: true });
    expect(verifyActionToken(readParams(body.actions[1].url), NOW, SECRET)).toMatchObject({ ok: true, action: "snooze" });
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("labels the timer reminder button 'Já tratei'", () => {
    const forgotten = buildOutgoingNotification({
      kind: "timer_forgotten",
      payload: { title: "X", message: "Y", priority: 4, tags: [], actions: ["done", "open"] },
      taskId: TASK_ID,
      occurrence: "2026-10-09",
      now: NOW,
      snoozeMinutes: 30,
      baseUrl: "https://toque.example.pt",
      secret: SECRET,
    });
    expect(forgotten.buttons.map((button) => button.label)).toEqual(["Já tratei"]);
  });

  it("omits buttons without a base URL or secret", () => {
    const bare = buildOutgoingNotification({
      kind: "timer_forgotten",
      payload: { title: "X", message: "Y", priority: 3, tags: [], actions: ["done"] },
      taskId: TASK_ID,
      occurrence: "2026-10-09",
      now: NOW,
      snoozeMinutes: 30,
      baseUrl: null,
      secret: SECRET,
    });
    expect(bare.buttons).toEqual([]);
    expect(bare.clickUrl).toBeNull();
  });

  it("throws on a non-2xx response without leaking the topic", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const notifier = createNtfyNotifier({ baseUrl: "https://ntfy.sh", topic: "segredo", fetch: fetchMock });
    await expect(notifier.send(notification)).rejects.toThrow("ntfy respondeu 429: rate limited");
  });
});
