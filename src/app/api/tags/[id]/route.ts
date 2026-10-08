// GET    /api/tags/:id → TagDto
// PATCH  /api/tags/:id  body UpdateTagRequest → TagDto (rename / reassign / action)
// DELETE /api/tags/:id → 204 (its URL stops working; history is kept)

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  buildTagDto,
  getPublicBaseUrl,
  getTagById,
  getTaskById,
} from "@/server/db/queries";
import { tags } from "@/server/db/schema";
import { updateTagRequestSchema } from "@/shared/api";
import {
  createErrorResponse,
  createNotFoundResponse,
  isUuid,
  parseJsonBody,
} from "../../_lib/http";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tags/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Etiqueta");
  const tag = await getTagById(await getDb(), id);
  if (!tag) return createNotFoundResponse("Etiqueta");
  return Response.json(buildTagDto(tag, getPublicBaseUrl(request)));
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tags/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Etiqueta");
  const parsed = await parseJsonBody(request, updateTagRequestSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getDb();
  const { label, taskId, action } = parsed.data;
  if (taskId && !(await getTaskById(db, taskId))) {
    return createErrorResponse(400, "Tarefa não encontrada");
  }
  const changes = {
    ...(label !== undefined && { label }),
    ...(taskId !== undefined && { taskId }),
    ...(action !== undefined && { action }),
  };
  const [row] =
    Object.keys(changes).length > 0
      ? await db.update(tags).set(changes).where(eq(tags.id, id)).returning()
      : [await getTagById(db, id)];
  if (!row) return createNotFoundResponse("Etiqueta");
  return Response.json(buildTagDto(row, getPublicBaseUrl(request)));
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/tags/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Etiqueta");
  const [deleted] = await (
    await getDb()
  )
    .delete(tags)
    .where(eq(tags.id, id))
    .returning();
  if (!deleted) return createNotFoundResponse("Etiqueta");
  return new Response(null, { status: 204 });
}
