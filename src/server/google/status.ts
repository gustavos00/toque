import type { Db } from "@/server/db";
import { getNextDemoResetAt } from "@/server/db/demo";
import type { GoogleStatusDto } from "@/shared/api";
import { isDemoMode } from "@/shared/demo";
import { getGoogleConnection, isGoogleConnected } from "./connection";
import { isGoogleConfigured } from "./oauth";

export const TOQUE_CALENDAR_NAME = "Toque";

export async function buildGoogleStatus(
  db: Db,
  now = new Date(),
): Promise<GoogleStatusDto> {
  if (isDemoMode()) {
    // Never read the connection on the demo.
    return {
      demo: true,
      demoResetAt: (await getNextDemoResetAt(db, now))?.toISOString() ?? null,
      configured: false,
      connected: false,
      email: null,
      calendarName: null,
      lastError: null,
      lastSyncAt: null,
    };
  }
  const row = await getGoogleConnection(db);
  return {
    demo: false,
    demoResetAt: null,
    configured: isGoogleConfigured(),
    connected: isGoogleConnected(row),
    email: row?.email ?? null,
    calendarName: row?.calendarId ? TOQUE_CALENDAR_NAME : null,
    lastError: row?.lastError ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
  };
}
