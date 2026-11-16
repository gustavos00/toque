import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSession, requireSession } from "./index";
import { isPasswordCorrect } from "./password";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  createSessionToken,
  isSecureRequest,
  isSessionTokenValid,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./session";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("accepts its own tokens and rejects tampered or foreign ones", async () => {
    const token = await createSessionToken();
    expect(await isSessionTokenValid(token)).toBe(true);
    expect(await isSessionTokenValid(`${token}x`)).toBe(false);
    expect(await isSessionTokenValid(undefined)).toBe(false);
    expect(await isSessionTokenValid("not-a-jwt")).toBe(false);

    vi.stubEnv(
      "TOQUE_SESSION_SECRET",
      "another-secret-that-is-long-enough-1234",
    );
    expect(await isSessionTokenValid(token)).toBe(false);
  });

  it("expires after the max age", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00Z");
    const token = await createSessionToken(issuedAt);
    const later = new Date(
      issuedAt.getTime() + (SESSION_MAX_AGE_SECONDS + 60) * 1000,
    );
    expect(await isSessionTokenValid(token, issuedAt)).toBe(true);
    expect(await isSessionTokenValid(token, later)).toBe(false);
  });

  it("requires a strong secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOQUE_SESSION_SECRET", "short");
    await expect(createSessionToken()).rejects.toThrow(/TOQUE_SESSION_SECRET/);
  });
});

describe("session cookie", () => {
  it("is HttpOnly and Lax, and not Secure on plain http (localhost)", () => {
    const request = new Request("http://localhost:3000/api/auth/login");
    expect(buildSessionCookie("t", request)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
    expect(buildClearedSessionCookie(request)).toMatchObject({
      value: "",
      maxAge: 0,
      secure: false,
    });
  });

  it("is Secure over https, directly or via x-forwarded-proto", () => {
    expect(
      buildSessionCookie("t", new Request("https://toque.example.pt/")).secure,
    ).toBe(true);
    const proxied = new Request("http://internal/api/auth/login", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(isSecureRequest(proxied)).toBe(true);
    expect(buildSessionCookie("t", proxied).secure).toBe(true);
    const forwardedHttp = new Request("http://localhost/", {
      headers: { "x-forwarded-proto": "http" },
    });
    expect(isSecureRequest(forwardedHttp)).toBe(false);
  });
});

describe("password", () => {
  it("compares against TOQUE_PASSWORD", () => {
    vi.stubEnv("TOQUE_PASSWORD", "secret");
    expect(isPasswordCorrect("secret")).toBe(true);
    expect(isPasswordCorrect("Segredo")).toBe(false);
    expect(isPasswordCorrect("")).toBe(false);
  });

  it("falls back to 'toque' in development but is required in production", () => {
    vi.stubEnv("TOQUE_PASSWORD", "");
    expect(isPasswordCorrect("toque")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => isPasswordCorrect("toque")).toThrow(/TOQUE_PASSWORD/);
  });

  it("uses the public demo password in demo mode, ignoring TOQUE_PASSWORD", () => {
    vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TOQUE_PASSWORD", "secret");
    expect(isPasswordCorrect("demo")).toBe(true);
    expect(isPasswordCorrect("secret")).toBe(false);
  });
});

describe("requireSession", () => {
  it("returns 401 without a valid cookie and null with one", async () => {
    const anonymous = new NextRequest("http://localhost/api/tasks");
    const denied = await requireSession(anonymous);
    expect(denied?.status).toBe(401);

    const authed = new NextRequest("http://localhost/api/tasks", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${await createSessionToken()}`,
      },
    });
    expect(await hasSession(authed)).toBe(true);
    expect(await requireSession(authed)).toBeNull();
  });
});

describe("bearer sessions", () => {
  const url = "http://localhost/api/tasks";

  it("accepts a valid Bearer token in place of the cookie", async () => {
    const token = await createSessionToken();
    const request = new NextRequest(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await hasSession(request)).toBe(true);
    expect(await requireSession(request)).toBeNull();
  });

  it("rejects invalid, malformed or other-scheme Authorization headers", async () => {
    const token = await createSessionToken();
    for (const authorization of [
      "Bearer nope",
      "Bearer",
      `Basic ${token}`,
      token,
    ]) {
      const request = new NextRequest(url, { headers: { authorization } });
      expect(await hasSession(request)).toBe(false);
      expect((await requireSession(request))?.status).toBe(401);
    }
  });
});

describe("portal sessions", () => {
  const url = "http://localhost/api/dashboard";
  const ownerId = "da95f154-e696-4bfc-b272-2f0b256c9fc6";

  function stubPortal(userId: string | null) {
    vi.stubEnv("TOQUE_PORTAL_SUPABASE_URL", "https://portal.supabase.co/");
    vi.stubEnv("TOQUE_PORTAL_SUPABASE_KEY", "sb_publishable_test");
    vi.stubEnv("TOQUE_PORTAL_OWNER_ID", ownerId);
    const fetchMock = vi.fn(async () =>
      userId === null
        ? new Response("{}", { status: 401 })
        : Response.json({ id: userId }),
    );
    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  }

  function buildBearerRequest(token: string) {
    return new NextRequest(url, {
      headers: { authorization: `Bearer ${token}` },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the owner's Supabase token and asks Supabase about it", async () => {
    const fetchMock = stubPortal(ownerId);

    expect(await requireSession(buildBearerRequest("supabase-jwt"))).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://portal.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: {
          apikey: "sb_publishable_test",
          Authorization: "Bearer supabase-jwt",
        },
      }),
    );
  });

  it("rejects another account, a token Supabase refuses, and a failed call", async () => {
    stubPortal("someone-else");
    expect(await hasSession(buildBearerRequest("supabase-jwt"))).toBe(false);

    stubPortal(null);
    expect(await hasSession(buildBearerRequest("supabase-jwt"))).toBe(false);

    stubPortal(ownerId).mockRejectedValueOnce(new Error("offline"));
    expect(await hasSession(buildBearerRequest("supabase-jwt"))).toBe(false);
  });

  it("is off without its settings and on the public demo", async () => {
    const fetchMock = stubPortal(ownerId);
    vi.stubEnv("TOQUE_PORTAL_OWNER_ID", "");
    expect(await hasSession(buildBearerRequest("supabase-jwt"))).toBe(false);

    vi.stubEnv("TOQUE_PORTAL_OWNER_ID", ownerId);
    vi.stubEnv("NEXT_PUBLIC_TOQUE_DEMO", "1");
    expect(await hasSession(buildBearerRequest("supabase-jwt"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Supabase for Toque's own tokens", async () => {
    const fetchMock = stubPortal(ownerId);

    expect(
      await hasSession(buildBearerRequest(await createSessionToken())),
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
