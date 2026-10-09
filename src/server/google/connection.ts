// The stored Google connection (table google_connection, single row) and the
// access-token lifecycle used by the calendar module.

import { eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db";
import { calendarEvents, googleConnection } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  GoogleAuthError,
  refreshGoogleAccessToken,
  type FetchFn,
  type GoogleTokens,
} from "./oauth";

type GoogleConnectionRow = typeof googleConnection.$inferSelect;

export async function getGoogleConnection(
  db: Db,
): Promise<GoogleConnectionRow | null> {
  const [row] = await db
    .select()
    .from(googleConnection)
    .where(eq(googleConnection.id, 1));
  return row ?? null;
}

/** Connected = a row exists and Google has not rejected its refresh token. */
export function isGoogleConnected(row: GoogleConnectionRow | null): boolean {
  return row !== null && row.brokenAt === null;
}

/**
 * Stores tokens from a fresh OAuth consent (upsert). Reconnecting the same
 * account keeps its calendar; a different account starts over (calendar_id
 * cleared, old event rows marked deleted — they live in the other account).
 */
export async function saveGoogleConnection(
  db: Db,
  tokens: GoogleTokens & { refreshToken: string; email: string },
  now = new Date(),
): Promise<GoogleConnectionRow> {
  const existing = await getGoogleConnection(db);
  const isSameAccount = existing?.email === tokens.email;
  if (existing && !isSameAccount) {
    await db
      .update(calendarEvents)
      .set({ deletedAt: now })
      .where(isNull(calendarEvents.deletedAt));
  }
  const values = {
    email: tokens.email,
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    scope: tokens.scope,
    calendarId: isSameAccount ? (existing?.calendarId ?? null) : null,
    connectedAt: now,
    brokenAt: null,
    lastError: null,
  };
  const [row] = await db
    .insert(googleConnection)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: googleConnection.id, set: values })
    .returning();
  return row;
}

/** Shown in settings; null clears it. */
export async function setGoogleLastError(
  db: Db,
  message: string | null,
): Promise<void> {
  await db
    .update(googleConnection)
    .set({ lastError: message })
    .where(eq(googleConnection.id, 1));
}

export async function deleteGoogleConnection(db: Db): Promise<void> {
  await db.delete(googleConnection).where(eq(googleConnection.id, 1));
}

/** The decrypted refresh token, or null when not connected. */
export async function getGoogleRefreshToken(db: Db): Promise<string | null> {
  const row = await getGoogleConnection(db);
  return row ? decryptSecret(row.refreshTokenEncrypted) : null;
}

/**
 * A valid access token for the Google APIs, refreshed when expired (or
 * always with `forceRefresh`, e.g. to retry once after a Google 401).
 * Throws GoogleAuthError:
 * - not_connected: no connection, or it is broken;
 * - invalid_grant: Google rejected the refresh token — the connection is
 *   marked broken (broken_at + last_error) and the user must reconnect;
 * - not_configured / http: env missing or Google unavailable.
 */
export async function getGoogleAccessToken(
  deps: { db?: Db; now?: Date; fetch?: FetchFn; forceRefresh?: boolean } = {},
): Promise<string> {
  const db = deps.db ?? (await getDb());
  const now = deps.now ?? new Date();
  const row = await getGoogleConnection(db);
  if (!row || row.brokenAt) {
    throw new GoogleAuthError("not_connected", "Google Calendar não ligado");
  }
  if (
    !deps.forceRefresh &&
    row.accessTokenEncrypted &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt > now
  ) {
    return decryptSecret(row.accessTokenEncrypted);
  }

  try {
    const tokens = await refreshGoogleAccessToken(
      decryptSecret(row.refreshTokenEncrypted),
      now,
      deps.fetch,
    );
    await db
      .update(googleConnection)
      .set({
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        // Google may rotate the refresh token; keep the newest.
        ...(tokens.refreshToken && {
          refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
        }),
      })
      .where(eq(googleConnection.id, 1));
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.code === "invalid_grant") {
      await db
        .update(googleConnection)
        .set({
          brokenAt: now,
          lastError: error.message,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
        })
        .where(eq(googleConnection.id, 1));
    }
    throw error;
  }
}
