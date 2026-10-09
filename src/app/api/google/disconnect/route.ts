// POST /api/google/disconnect → GoogleStatusDto
// Deletes the "Toque" calendar (best effort), revokes the token at Google,
// then forgets the connection and the event rows.

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { deleteToqueCalendar } from "@/server/calendar";
import { getDb } from "@/server/db";
import { isDemoMode } from "@/shared/demo";
import { calendarEvents } from "@/server/db/schema";
import {
  buildGoogleStatus,
  deleteGoogleConnection,
  getGoogleConnection,
  getGoogleRefreshToken,
  revokeGoogleToken,
} from "@/server/google";
import { createDemoBlockedResponse } from "../../_lib/http";

export async function POST(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  if (isDemoMode()) return createDemoBlockedResponse();

  const db = await getDb();
  if (await getGoogleConnection(db)) {
    try {
      await deleteToqueCalendar();
    } catch (error) {
      console.error("Deleting the Toque calendar failed", error);
    }
    try {
      const refreshToken = await getGoogleRefreshToken(db);
      if (refreshToken) await revokeGoogleToken(refreshToken);
    } catch (error) {
      console.error("Revoking the Google token failed", error);
    }
    await deleteGoogleConnection(db);
  }
  await db.delete(calendarEvents);
  return Response.json(await buildGoogleStatus(db));
}
