import { defineConfig, devices } from "@playwright/test";
import { E2E_DEMO_ENV, E2E_DEMO_PORT } from "./e2e/env";

// Public demo (NEXT_PUBLIC_TOQUE_DEMO=1). NEXT_PUBLIC_ values are inlined at
// build time, so this builds into .next-demo and serves it on its own port.
//   npm run test:e2e:demo
const baseURL = `http://localhost:${E2E_DEMO_PORT}`;

export default defineConfig({
  testDir: "./e2e/demo",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "iphone-demo",
      use: { ...devices["iPhone 15"], locale: "pt-PT", timezoneId: "Europe/Lisbon" },
    },
  ],
  webServer: {
    command: `npx next build && npx next start --port ${E2E_DEMO_PORT}`,
    url: `${baseURL}/api/tick`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: E2E_DEMO_ENV,
  },
});
