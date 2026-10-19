// GET /api/reminders/upcoming?limit=N → { reminders: UpcomingReminder[] }
// The next reminders of the signed-in user (cookie or Bearer), nearest first, with signed
// "Feito"/"Adiar" URLs. The app turns them into local notifications. Default 50, max 64
// (iOS keeps at most 64 pending local notifications).

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getPublicBaseUrl } from "@/server/db/queries";
import { listUpcomingReminders } from "@/server/engine/upcoming";
import { createErrorResponse } from "../../_lib/http";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 64;

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const raw = request.nextUrl.searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    return createErrorResponse(400, `limit deve estar entre 1 e ${MAX_LIMIT}`);

  const reminders = await listUpcomingReminders({
    now: new Date(),
    limit,
    baseUrl: getPublicBaseUrl(request),
  });
  return Response.json(
    { reminders },
    { headers: { "Cache-Control": "no-store" } },
  );
}
