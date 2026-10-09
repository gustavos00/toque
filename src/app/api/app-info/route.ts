// GET /api/app-info → AppInfoDto. Public (no session), e.g. for the login page.

import { connection } from "next/server";
import { getDb } from "@/server/db";
import { getNextDemoResetAt, maybeResetDemoData } from "@/server/db/demo";
import type { AppInfoDto } from "@/shared/api";
import { isDemoMode } from "@/shared/demo";

export async function GET() {
  // Read the env at request time, not at build time.
  await connection();
  let demoResetAt: string | null = null;
  if (isDemoMode()) {
    const db = await getDb();
    const now = new Date();
    await maybeResetDemoData(db, now);
    demoResetAt = (await getNextDemoResetAt(db, now))?.toISOString() ?? null;
  }
  const body: AppInfoDto = { demo: isDemoMode(), demoResetAt };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
