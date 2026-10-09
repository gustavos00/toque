import { expect, test } from "@playwright/test";

test("/api/app-info é público e diz que não é a demonstração", async ({ request }) => {
  const response = await request.get("/api/app-info");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ demo: false, demoResetAt: null });
});
