// Single-user session: a signed JWT (HS256, jose) in an HttpOnly cookie.
// No Node-only imports here so it can run anywhere (proxy, route handlers).

import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "toque_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

const SESSION_SUBJECT = "owner";
const DEV_SESSION_SECRET = "toque-dev-only-session-secret-change-me";
const MIN_SECRET_LENGTH = 32;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * The signing key (also used for other short-lived signed values, such as
 * the Google OAuth state). In production TOQUE_SESSION_SECRET (≥ 32 chars)
 * is required.
 */
export function getSessionKey(): Uint8Array {
  const secret = process.env.TOQUE_SESSION_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH)
    return new TextEncoder().encode(secret);
  if (isProduction()) {
    throw new Error(
      `TOQUE_SESSION_SECRET must be set (at least ${MIN_SECRET_LENGTH} characters).`,
    );
  }
  return new TextEncoder().encode(DEV_SESSION_SECRET);
}

export async function createSessionToken(now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSION_SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE_SECONDS)
    .sign(getSessionKey());
}

export async function isSessionTokenValid(
  token: string | undefined,
  now = new Date(),
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ["HS256"],
      subject: SESSION_SUBJECT,
      currentDate: now,
    });
    return payload.sub === SESSION_SUBJECT;
  } catch {
    return false;
  }
}

/**
 * Was the request made over HTTPS (directly or behind a proxy such as Vercel,
 * which always sets x-forwarded-proto)? Decides the cookie's Secure flag, so
 * `next start` on http://localhost still works (WebKit drops Secure cookies
 * on http).
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded)
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  return new URL(request.url).protocol === "https:";
}

/** Options for `response.cookies.set(...)` that store a session. */
export function buildSessionCookie(token: string, request: Request) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Options for `response.cookies.set(...)` that remove the session. */
export function buildClearedSessionCookie(request: Request) {
  return { ...buildSessionCookie("", request), maxAge: 0 };
}
