import { and, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setCalendarClientFactory,
  syncAllCalendarEvents,
} from "@/server/calendar";
import type { GoogleCalendarClient } from "@/server/calendar";
import { schema, type Db } from "@/server/db";
import { createTestDb } from "@/server/db/testing";
import {
  createActionUrl,
  createNotifierFromSettings,
  readSignedActionParams,
  type Notifier,
} from "@/server/notify";
import { DEFAULT_SETTINGS } from "@/shared/settings";
import { createLocalInstant } from "@/shared/time";
import { handleNotificationAction, handleScan, runTick } from "./index";

const at = (date: string, time: string) => createLocalInstant(date, time);
const SECRET = "demo-secret-0123456789abcdef";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "1");
  vi.stubEnv("NTFY_TOPIC", "um-topico");
  vi.stubEnv("TOQUE_ACTION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  setCalendarClientFactory(null);
});

async function insertTimer() {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      name: "Máquina",
      kind: "timer",
      config: { durationMinutes: 30 } as never,
    })
    .returning();
  return row.id;
}

describe("demo mode", () => {
  it("never sends to ntfy, even with a topic or an injected notifier; rows stay planned", async () => {
    expect(
      createNotifierFromSettings({
        ...DEFAULT_SETTINGS,
        ntfy: { ...DEFAULT_SETTINGS.ntfy, topic: "x" },
      }),
    ).toBeNull();

    const taskId = await insertTimer();
    await handleScan({
      taskId,
      tagId: null as unknown as string,
      action: "start",
      now: at("2026-10-09", "10:00"),
    });
    const send = vi.fn<Notifier["send"]>(async () => {});
    expect(
      await runTick(at("2026-10-09", "10:31"), { notifier: { send } }),
    ).toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();

    const pending = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          isNull(schema.notifications.sentAt),
          isNull(schema.notifications.cancelledAt),
        ),
      );
    expect(pending.map((row) => row.kind)).toContain("timer_finished");
  });

  it("skips Google Calendar before any Google call", async () => {
    await db
      .insert(schema.googleConnection)
      .values({ id: 1, email: "eu@example.pt", refreshTokenEncrypted: "x" });
    const factory = vi.fn<() => GoogleCalendarClient>();
    setCalendarClientFactory(factory);
    await insertTimer();
    await syncAllCalendarEvents(at("2026-10-09", "10:00"));
    await runTick(at("2026-10-09", "10:00"), { notifier: null });
    expect(factory).not.toHaveBeenCalled();
  });

  it("refuses notification action links with 403", async () => {
    const taskId = await insertTimer();
    const url = new URL(
      createActionUrl({
        baseUrl: "https://toque-demo.example",
        action: "snooze",
        taskId,
        occurrence: "2026-10-09",
        expiresAt: at("2026-10-10", "10:00"),
        secret: SECRET,
      }),
    );
    expect(
      await handleNotificationAction(
        readSignedActionParams(url, "snooze"),
        at("2026-10-09", "10:00"),
      ),
    ).toEqual({
      ok: false,
      status: 403,
      reason: "demo",
    });
  });
});
