// Auth helpers for route handlers.
//
//   export async function GET(request: NextRequest) {
//     const denied = await requireSession(request);
//     if (denied) return denied;
//     ...
//   }

import type { NextRequest } from "next/server";
import { isSessionTokenValid, SESSION_COOKIE_NAME } from "./session";

export {
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionToken,
  isSessionTokenValid,
  SESSION_COOKIE_NAME,
} from "./session";
export { isPasswordCorrect } from "./password";

/** Is the request carrying a valid session cookie? */
export async function hasSession(request: NextRequest): Promise<boolean> {
  return isSessionTokenValid(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

/** null when authenticated, otherwise a 401 JSON response to return as-is. */
export async function requireSession(
  request: NextRequest,
): Promise<Response | null> {
  if (await hasSession(request)) return null;
  return Response.json(
    { error: "Sessão inválida ou expirada" },
    { status: 401 },
  );
}
