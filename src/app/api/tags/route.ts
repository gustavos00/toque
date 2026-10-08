// GET  /api/tags → TagDto[] (by label)
// POST /api/tags  body CreateTagRequest → 201 TagDto (token generated here)

import { asc } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import {
  buildTagDto,
  createTagToken,
  getPublicBaseUrl,
  getTaskById,
} from "@/server/db/queries";
import { tags } from "@/server/db/schema";
import { createTagRequestSchema, type TagDto } from "@/shared/api";
import { createErrorResponse, parseJsonBody } from "../_lib/http";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const db = await getDb();
  const rows = await db.select().from(tags).orderBy(asc(tags.label));
  const baseUrl = getPublicBaseUrl(request);
  const body: TagDto[] = rows.map((row) => buildTagDto(row, baseUrl));
  return Response.json(body);
}

export async function POST(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const parsed = await parseJsonBody(request, createTagRequestSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getDb();
  const { label, taskId, action } = parsed.data;
  if (taskId && !(await getTaskById(db, taskId))) {
    return createErrorResponse(400, "Tarefa não encontrada");
  }
  const [row] = await db
    .insert(tags)
    .values({ label, taskId, action, token: createTagToken() })
    .returning();
  return Response.json(buildTagDto(row, getPublicBaseUrl(request)), {
    status: 201,
  });
}
