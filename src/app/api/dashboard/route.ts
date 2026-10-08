// GET /api/dashboard → DashboardDto

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { buildDashboard } from "@/server/db/dashboard";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  return Response.json(await buildDashboard(await getDb(), new Date()));
}
