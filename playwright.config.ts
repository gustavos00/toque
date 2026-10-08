import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./e2e/env";

// E2E runs against its own server on a free port with an in-memory PGlite, so
// it never touches a dev server on :3000 or its .data/pglite.
//
// Default: `next build` + `next start` (production mode; can run beside a
// `next dev`, since Next 16 keeps dev output in .next/dev). E2E_SERVER=dev uses
// `next dev` instead — faster to start, but Next 16 allows only one `next dev`
// per folder, so stop yours first.
const useDevServer = process.env.E2E_SERVER === "dev";
const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One in-memory DB shared by all specs; keep them in one worker so the
  // single-user state stays predictable.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 15"], locale: "pt-PT", timezoneId: "Europe/Lisbon" },
    },
  ],
  webServer: {
    command: useDevServer
      ? `npx next dev --port ${E2E_PORT}`
      : `npx next build && npx next start --port ${E2E_PORT}`,
    // Answers 401 without the cron secret, which Playwright counts as "ready".
    url: `${baseURL}/api/tick`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: E2E_ENV,
  },
});
