// POST /api/actions/:action?task=&exp=&sig= — ntfy notification buttons
// ("done" / "snooze"). No session: the HMAC-signed, expiring URL is the
// credential (built by the engine). → 200 ScanResult | 400 | 403 ApiError

import type { NextRequest } from "next/server";
import { handleNotificationAction } from "@/server/engine";
import { readSignedActionParams } from "@/server/notify";
import { createErrorResponse } from "../../_lib/http";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/actions/[action]">,
) {
  const { action } = await ctx.params;
  const outcome = await handleNotificationAction(
    readSignedActionParams(request.nextUrl, action),
    new Date(),
  );
  if (!outcome.ok) return createErrorResponse(outcome.status, outcome.reason);
  return Response.json(outcome.result);
}
