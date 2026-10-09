// POST /api/google/resync → GoogleStatusDto (after a full calendar sync)
// 409 when Google is not connected; 502 when the sync fails.

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { syncAllCalendarEvents } from "@/server/calendar";
import { getDb } from "@/server/db";
import { isDemoMode } from "@/shared/demo";
import {
  buildGoogleStatus,
  getGoogleConnection,
  isGoogleConnected,
} from "@/server/google";
import {
  createDemoBlockedResponse,
  createErrorResponse,
} from "../../_lib/http";

export async function POST(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  if (isDemoMode()) return createDemoBlockedResponse();

  const db = await getDb();
  if (!isGoogleConnected(await getGoogleConnection(db))) {
    return createErrorResponse(409, "Google Calendar não está ligado");
  }
  try {
    await syncAllCalendarEvents(new Date());
  } catch (error) {
    console.error("Calendar resync failed", error);
    return createErrorResponse(
      502,
      "Não foi possível sincronizar com o Google Calendar",
    );
  }
  return Response.json(await buildGoogleStatus(db));
}
