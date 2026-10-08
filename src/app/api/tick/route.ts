// GET|POST /api/tick — called every minute by an external cron.
// Requires `Authorization: Bearer <TOQUE_CRON_SECRET>`; no session cookie.

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runTick } from "@/server/engine";
import { createErrorResponse } from "../_lib/http";

function hashValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function isCronAuthorized(request: NextRequest, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return (
    match !== null &&
    timingSafeEqual(hashValue(match[1].trim()), hashValue(secret))
  );
}

async function handleTick(request: NextRequest) {
  const secret = process.env.TOQUE_CRON_SECRET;
  if (!secret)
    return createErrorResponse(503, "TOQUE_CRON_SECRET não está configurado");
  if (!isCronAuthorized(request, secret))
    return createErrorResponse(401, "Não autorizado");

  const result = await runTick(new Date());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handleTick;
export const POST = handleTick;
