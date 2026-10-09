// Test-only environment for the e2e server. None of these are real secrets.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 4417);
/** Second `next start` (build mode only) whose Google config is invalid. */
export const E2E_NO_GOOGLE_PORT = E2E_PORT + 2;

export const E2E_PASSWORD = "e2e-palavra-passe";
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789abcdef0123456789";

// Fake Google OAuth client: only used to build the consent URL; e2e never
// talks to Google.
export const E2E_GOOGLE_CLIENT_ID = "e2e-toque.apps.googleusercontent.com";

export const E2E_ENV: Record<string, string> = {
  // Empty → PGlite instead of Neon, even if the shell has a DATABASE_URL.
  DATABASE_URL: "",
  TOQUE_PGLITE_DIR: "memory://",
  TOQUE_PASSWORD: E2E_PASSWORD,
  TOQUE_SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123456789",
  TOQUE_CRON_SECRET: E2E_CRON_SECRET,
  TOQUE_ACTION_SECRET: "e2e-action-secret-0123456789abcdef0123456789",
  TOQUE_PUBLIC_URL: `http://localhost:${E2E_PORT}`,
  // No topic → the engine must not call ntfy.sh during tests.
  NTFY_TOPIC: "",
  NTFY_BASE_URL: "http://127.0.0.1:9",
  NTFY_TOKEN: "",
  GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
  // 32 zero bytes, base64 — a test-only key.
  TOQUE_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** Same as E2E_ENV but with an invalid TOQUE_ENCRYPTION_KEY → Google not configured. */
export const E2E_NO_GOOGLE_ENV: Record<string, string> = {
  ...E2E_ENV,
  TOQUE_ENCRYPTION_KEY: "isto-nao-e-uma-chave-de-32-bytes",
  TOQUE_PUBLIC_URL: `http://localhost:${E2E_NO_GOOGLE_PORT}`,
};
