// GET /api/events?limit=&beforeId=&taskId=&type= → EventListDto (newest first)

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { listEvents } from "@/server/db/history";
import { listEventsQuerySchema, type EventListDto } from "@/shared/api";
import { parseValue } from "../_lib/http";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const query = parseValue(
    Object.fromEntries(request.nextUrl.searchParams),
    listEventsQuerySchema,
  );
  if (!query.ok) return query.response;

  const { limit, beforeId, taskId, type } = query.data;
  const page = await listEvents(await getDb(), {
    // One extra row tells us whether there is a next page.
    limit: limit + 1,
    beforeId: beforeId ? Number(beforeId) : undefined,
    taskId,
    type,
  });
  const hasMore = page.length > limit;
  const visible = page.slice(0, limit);
  const body: EventListDto = {
    events: visible,
    nextBeforeId: hasMore ? visible[visible.length - 1].id : null,
  };
  return Response.json(body);
}
