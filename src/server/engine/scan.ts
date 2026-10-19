// Tag scans confirmed by the user in the app popup (Universal Link /t/<token> → app →
// POST /api/scan/<token>). The tag token is the credential.

import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { maybeResetDemoData } from "@/server/db/demo";
import { getTagByToken, getTaskById } from "@/server/db/queries";
import { events, tags } from "@/server/db/schema";
import { isDemoMode } from "@/shared/demo";
import type { ScanResult } from "@/shared/scan";
import { handleScan, handleTaskSnooze } from "./index";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type TagScanInfo = {
  tagLabel: string;
  taskName: string | null;
  /** True when a scan can be recorded (task exists and is enabled). */
  canScan: boolean;
};

async function findTag(token: string) {
  const db = await getDb();
  await maybeResetDemoData(db, new Date());
  const tag = TOKEN_PATTERN.test(token) ? await getTagByToken(db, token) : null;
  return { db, tag };
}

/** What the popup shows for a tag; records nothing. Null for unknown tokens. */
export async function getTagScanInfo(
  token: string,
): Promise<TagScanInfo | null> {
  const { db, tag } = await findTag(token);
  if (!tag) return null;
  const task = tag.taskId ? await getTaskById(db, tag.taskId) : null;
  return {
    tagLabel: tag.label,
    taskName: task?.name ?? null,
    canScan: Boolean(task?.enabled),
  };
}

type ScanOutcome = { status: 200 | 404 | 500; result: ScanResult };

/** "Feito" in the popup: logs the scan and lets the engine react (the tag's own action). */
export async function recordTagScan(
  token: string,
  input: { now: Date; userAgent: string | null },
): Promise<ScanOutcome> {
  const { db, tag } = await findTag(token);
  if (!tag) {
    return {
      status: 404,
      result: {
        title: "Etiqueta desconhecida",
        message: "Esta etiqueta não está registada no Toque.",
        tone: "info",
      },
    };
  }
  const { now } = input;
  const task = tag.taskId ? await getTaskById(db, tag.taskId) : null;
  if (!task) {
    return {
      status: 200,
      result: {
        title: tag.label,
        message: "Esta etiqueta ainda não está associada a nenhuma tarefa.",
        tone: "info",
      },
    };
  }
  if (!task.enabled) {
    return {
      status: 200,
      result: {
        title: task.name,
        message: "Esta tarefa está desativada.",
        tone: "info",
      },
    };
  }
  await db.update(tags).set({ lastScannedAt: now }).where(eq(tags.id, tag.id));
  await db.insert(events).values({
    type: "scan",
    at: now,
    taskId: task.id,
    tagId: tag.id,
    data: {
      action: tag.action,
      // No device details on the public demo.
      userAgent: isDemoMode() ? undefined : (input.userAgent ?? undefined),
    },
  });
  try {
    return {
      status: 200,
      result: await handleScan({
        taskId: task.id,
        tagId: tag.id,
        action: tag.action,
        now,
      }),
    };
  } catch (error) {
    console.error("handleScan failed", error);
    return {
      status: 500,
      result: {
        title: task.name,
        message: "O toque foi registado, mas algo correu mal. Tente novamente.",
        tone: "info",
      },
    };
  }
}

/** "Adiar" in the popup: snoozes the tag's task. Nothing is logged as a scan. */
export async function snoozeTagTask(
  token: string,
  now: Date,
): Promise<ScanOutcome> {
  const { db, tag } = await findTag(token);
  const task = tag?.taskId ? await getTaskById(db, tag.taskId) : null;
  if (!task || !task.enabled) {
    return {
      status: tag ? 200 : 404,
      result: {
        title: tag?.label ?? "Etiqueta desconhecida",
        message: tag
          ? "Não há nenhuma tarefa ativa para adiar."
          : "Esta etiqueta não está registada no Toque.",
        tone: "info",
      },
    };
  }
  return { status: 200, result: await handleTaskSnooze(task.id, now) };
}
