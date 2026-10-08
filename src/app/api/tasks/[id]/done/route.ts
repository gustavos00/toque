// POST /api/tasks/:id/done — "mark done" from the app (same as the
// notification button): completes / acknowledges / confirms. → ScanResult

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { getTaskById } from "@/server/db/queries";
import { handleTaskDone } from "@/server/engine";
import { createNotFoundResponse, isUuid } from "../../../_lib/http";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/done">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getTaskById(await getDb(), id)))
    return createNotFoundResponse("Tarefa");
  return Response.json(await handleTaskDone(id, new Date()));
}
