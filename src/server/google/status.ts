import type { Db } from "@/server/db";
import type { GoogleStatusDto } from "@/shared/api";
import { getGoogleConnection, isGoogleConnected } from "./connection";
import { isGoogleConfigured } from "./oauth";

export const TOQUE_CALENDAR_NAME = "Toque";

export async function buildGoogleStatus(db: Db): Promise<GoogleStatusDto> {
  const row = await getGoogleConnection(db);
  return {
    configured: isGoogleConfigured(),
    connected: isGoogleConnected(row),
    email: row?.email ?? null,
    calendarName: row?.calendarId ? TOQUE_CALENDAR_NAME : null,
    lastError: row?.lastError ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
  };
}
