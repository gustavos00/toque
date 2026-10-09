// GET /api/google/status → GoogleStatusDto

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { buildGoogleStatus } from "@/server/google";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  return Response.json(await buildGoogleStatus(await getDb()));
}
