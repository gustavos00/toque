import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "./env";

test.describe("/api/tick (cron)", () => {
  test("recusa pedidos sem segredo", async ({ request }) => {
    const response = await request.get("/api/tick");
    expect(response.status()).toBe(401);
  });

  test("recusa um segredo errado", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: "Bearer segredo-errado" },
    });
    expect(response.status()).toBe(401);
  });

  test("recusa o segredo sem o prefixo Bearer", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: E2E_CRON_SECRET },
    });
    expect(response.status()).toBe(401);
  });

  test("aceita o segredo certo", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
    });
    expect(response.status()).toBe(200);
  });
});
