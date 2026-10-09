// Google OAuth 2.0 (authorization code flow, offline access) with plain fetch.

import { decodeJwt, jwtVerify, SignJWT } from "jose";
import { getSessionKey } from "@/server/auth/session";
import { isDemoMode } from "@/shared/demo";
import { getAppBaseUrl } from "@/server/notify";
import { getEncryptionKey } from "./crypto";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const GOOGLE_SCOPES = ["openid", "email", GOOGLE_CALENDAR_SCOPE];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_AUDIENCE = "toque:google-oauth";
const STATE_TTL_SECONDS = 10 * 60;

export type FetchFn = typeof fetch;

type GoogleCredentials = { clientId: string; clientSecret: string };

/** GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, or null when not set. */
export function getGoogleCredentials(): GoogleCredentials | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * All env needed for Google is present (credentials + encryption key).
 * Always false on the public demo, where Google is blocked.
 */
export function isGoogleConfigured(): boolean {
  if (isDemoMode()) return false;
  return getGoogleCredentials() !== null && getEncryptionKey() !== null;
}

function requireGoogleCredentials(): GoogleCredentials {
  const credentials = isDemoMode() ? null : getGoogleCredentials();
  if (!credentials) {
    throw new GoogleAuthError(
      "not_configured",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET em falta",
    );
  }
  return credentials;
}

/**
 * Failure talking to Google's OAuth endpoints. `invalid_grant` means the
 * refresh token is revoked/expired: the user must connect again.
 */
export class GoogleAuthError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "not_connected"
      | "invalid_grant"
      | "invalid_state"
      | "missing_scope"
      | "http",
    message: string,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/**
 * `${publicUrl}/api/google/callback`. publicUrl = TOQUE_PUBLIC_URL, else
 * VERCEL_PROJECT_PRODUCTION_URL, else the request origin (local dev).
 * Must be registered as an authorized redirect URI in Google Cloud.
 */
export function getGoogleRedirectUri(request: Request): string {
  const baseUrl = getAppBaseUrl() ?? new URL(request.url).origin;
  return `${baseUrl}/api/google/callback`;
}

/** Signed, expiring OAuth `state` (CSRF protection for the callback). */
export async function createGoogleState(now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + STATE_TTL_SECONDS)
    .sign(getSessionKey());
}

export async function isGoogleStateValid(
  state: string | null | undefined,
  now = new Date(),
): Promise<boolean> {
  if (!state) return false;
  try {
    await jwtVerify(state, getSessionKey(), {
      algorithms: ["HS256"],
      audience: STATE_AUDIENCE,
      currentDate: now,
    });
    return true;
  } catch {
    return false;
  }
}

export function buildGoogleAuthUrl(input: {
  redirectUri: string;
  state: string;
}): string {
  const { clientId } = requireGoogleCredentials();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always show consent so Google returns a refresh token.
    prompt: "consent",
    include_granted_scopes: "false",
    state: input.state,
  }).toString();
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

async function requestToken(
  params: Record<string, string>,
  fetchFn: FetchFn,
): Promise<TokenResponse> {
  const response = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as Partial<
    TokenResponse & { error: string; error_description: string }
  >;
  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      throw new GoogleAuthError(
        "invalid_grant",
        "A ligação ao Google expirou ou foi revogada. Volta a ligar.",
      );
    }
    throw new GoogleAuthError(
      "http",
      `Google respondeu ${response.status}: ${body.error_description ?? body.error ?? "erro desconhecido"}`,
    );
  }
  return body as TokenResponse;
}

export type GoogleTokens = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  /** Only present on the code exchange (prompt=consent). */
  refreshToken: string | null;
  scope: string;
  /** From the id_token (openid email scope). */
  email: string | null;
};

function buildTokens(body: TokenResponse, now: Date): GoogleTokens {
  let email: string | null = null;
  if (body.id_token) {
    // Received straight from Google's token endpoint over TLS, so the
    // signature check is not needed (OpenID Connect Core §3.1.3.7).
    const claims = decodeJwt(body.id_token);
    email = typeof claims.email === "string" ? claims.email : null;
  }
  return {
    accessToken: body.access_token,
    // Refresh a minute early.
    accessTokenExpiresAt: new Date(
      now.getTime() + Math.max(0, body.expires_in - 60) * 1000,
    ),
    refreshToken: body.refresh_token ?? null,
    scope: body.scope ?? "",
    email,
  };
}

/** Exchanges the callback `code` for tokens. */
export async function exchangeGoogleCode(
  input: { code: string; redirectUri: string; now?: Date },
  fetchFn: FetchFn = fetch,
): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireGoogleCredentials();
  const body = await requestToken(
    {
      grant_type: "authorization_code",
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
    },
    fetchFn,
  );
  return buildTokens(body, input.now ?? new Date());
}

/** New access token from the refresh token. Throws invalid_grant if revoked. */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  now = new Date(),
  fetchFn: FetchFn = fetch,
): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireGoogleCredentials();
  const body = await requestToken(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    fetchFn,
  );
  return buildTokens(body, now);
}

/** Best effort: revoking an already invalid token is not an error for us. */
export async function revokeGoogleToken(
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}
