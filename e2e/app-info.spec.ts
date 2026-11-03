import { expect, test } from "@playwright/test";

test("/api/app-info is public and says it is not the demo", async ({ request }) => {
  const response = await request.get("/api/app-info");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ demo: false, demoResetAt: null });
});
