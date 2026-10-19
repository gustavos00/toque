import { afterEach, describe, expect, it, vi } from "vitest";

const route =
  await import("../../.well-known/apple-app-site-association/route");

afterEach(() => vi.unstubAllEnvs());

describe("apple-app-site-association", () => {
  it("is 404 until the team id is set", () => {
    vi.stubEnv("TOQUE_APPLE_TEAM_ID", "");
    expect(route.GET().status).toBe(404);
  });

  it("links /t/* to the app id", async () => {
    vi.stubEnv("TOQUE_APPLE_TEAM_ID", "ABCDE12345");
    const body = await route.GET().json();
    expect(body.applinks.details[0]).toEqual({
      appIDs: ["ABCDE12345.com.gustavo.toque"],
      components: [{ "/": "/t/*" }],
    });
  });
});
