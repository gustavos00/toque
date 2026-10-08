// POST /api/tasks/:id/snooze — holds the task's notifications for
// settings.defaults.snoozeMinutes. → ScanResult

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { getTaskById } from "@/server/db/queries";
import { handleTaskSnooze } from "@/server/engine";
import { createNotFoundResponse, isUuid } from "../../../_lib/http";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/snooze">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getTaskById(await getDb(), id)))
    return createNotFoundResponse("Tarefa");
  return Response.json(await handleTaskSnooze(id, new Date()));
}
