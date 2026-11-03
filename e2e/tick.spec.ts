import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET } from "./env";

test.describe("/api/tick (cron)", () => {
  test("rejects requests without a secret", async ({ request }) => {
    const response = await request.get("/api/tick");
    expect(response.status()).toBe(401);
  });

  test("rejects a wrong secret", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(response.status()).toBe(401);
  });

  test("rejects the secret without the Bearer prefix", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: E2E_CRON_SECRET },
    });
    expect(response.status()).toBe(401);
  });

  test("accepts the right secret", async ({ request }) => {
    const response = await request.get("/api/tick", {
      headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
    });
    expect(response.status()).toBe(200);
  });
});
