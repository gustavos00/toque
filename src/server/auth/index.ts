// Auth helpers for route handlers.
//
//   export async function GET(request: NextRequest) {
//     const denied = await requireSession(request);
//     if (denied) return denied;
//     ...
//   }
//
// On the public demo, requireSession also performs the periodic data wipe
// (maybeResetDemoData) so every protected route stays fresh.

import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { maybeResetDemoData } from "@/server/db/demo";
import { isDemoMode } from "@/shared/demo";
import { isSessionTokenValid, SESSION_COOKIE_NAME } from "./session";

export {
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionToken,
  isSessionTokenValid,
  SESSION_COOKIE_NAME,
} from "./session";
export { isPasswordCorrect } from "./password";

/** The token from `Authorization: Bearer <token>`, if present. */
function readBearerToken(request: NextRequest): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  return match?.[1];
}

/**
 * Is the request carrying a valid session, as the cookie (web) or as an
 * `Authorization: Bearer` header (native app)? Both hold the same JWT.
 */
export async function hasSession(request: NextRequest): Promise<boolean> {
  const token =
    request.cookies.get(SESSION_COOKIE_NAME)?.value ??
    readBearerToken(request);
  return isSessionTokenValid(token);
}

/**
 * null when authenticated, otherwise a 401 JSON response to return as-is.
 * Demo mode: runs the periodic data wipe first (one SELECT when not due).
 */
export async function requireSession(
  request: NextRequest,
): Promise<Response | null> {
  if (!(await hasSession(request))) {
    return Response.json(
      { error: "Sessão inválida ou expirada" },
      { status: 401 },
    );
  }
  if (isDemoMode()) await maybeResetDemoData(await getDb(), new Date());
  return null;
}
