// Test-only environment for the e2e server. None of these are real secrets.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 4417);

export const E2E_PASSWORD = "e2e-palavra-passe";
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789abcdef0123456789";

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
  NEXT_TELEMETRY_DISABLED: "1",
};
