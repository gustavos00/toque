// GET /t/:token — the URL stored on each NFC tag. No session needed: the
// token is the credential. Records the scan, lets the engine react, and shows
// a small confirmation page in Portuguese.

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { getTagByToken, getTaskById } from "@/server/db/queries";
import { events, tags } from "@/server/db/schema";
import { handleScan } from "@/server/engine";
import { renderScanPage } from "./render-page";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/t/[token]">,
) {
  const { token } = await ctx.params;
  const db = await getDb();
  const tag = TOKEN_PATTERN.test(token) ? await getTagByToken(db, token) : null;
  if (!tag) {
    return renderScanPage(
      {
        title: "Etiqueta desconhecida",
        message: "Esta etiqueta não está registada no Toque.",
        tone: "info",
      },
      404,
    );
  }

  const now = new Date();
  await db.update(tags).set({ lastScannedAt: now }).where(eq(tags.id, tag.id));
  await db.insert(events).values({
    type: "scan",
    at: now,
    taskId: tag.taskId,
    tagId: tag.id,
    data: {
      action: tag.action,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
  });

  const task = tag.taskId ? await getTaskById(db, tag.taskId) : null;
  if (!task) {
    return renderScanPage({
      title: tag.label,
      message: "Esta etiqueta ainda não está associada a nenhuma tarefa.",
      tone: "info",
    });
  }
  if (!task.enabled) {
    return renderScanPage({
      title: task.name,
      message: "Esta tarefa está desativada.",
      tone: "info",
    });
  }

  try {
    return renderScanPage(
      await handleScan({
        taskId: task.id,
        tagId: tag.id,
        action: tag.action,
        now,
      }),
    );
  } catch (error) {
    console.error("handleScan failed", error);
    return renderScanPage(
      {
        title: task.name,
        message: "O toque foi registado, mas algo correu mal. Tente novamente.",
        tone: "info",
      },
      500,
    );
  }
}

// HEAD would otherwise run GET and record a scan (link previews, prefetchers).
export function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
