import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { googleConnection } from "@/server/db/schema";
import { createTestDb } from "@/server/db/testing";
import {
  getGoogleAccessToken,
  getGoogleConnection,
  saveGoogleConnection,
} from "./connection";
import {
  decryptSecret,
  encryptSecret,
  getEncryptionKey,
  getEncryptionKeyProblem,
} from "./crypto";
import {
  buildGoogleAuthUrl,
  createGoogleState,
  exchangeGoogleCode,
  GoogleAuthError,
  isGoogleConfigured,
  isGoogleStateValid,
} from "./oauth";

const KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.stubEnv("TOQUE_ENCRYPTION_KEY", KEY);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function createFetchMock(
  responses: { status?: number; body: Record<string, unknown> }[],
) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    return Response.json(next.body, { status: next.status ?? 200 });
  });
}

async function createIdToken(email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode("google-signs-this"));
}

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const first = encryptSecret("1//refresh-token");
    const second = encryptSecret("1//refresh-token");
    expect(first).not.toBe(second);
    expect(first).not.toContain("refresh-token");
    expect(decryptSecret(first)).toBe("1//refresh-token");
  });

  it("rejects tampering and other keys", () => {
    const value = encryptSecret("segredo");
    const parts = value.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
    expect(() => decryptSecret(value, Buffer.alloc(32, 9))).toThrow();
  });

  it("accepts only base64 of exactly 32 bytes", () => {
    expect(getEncryptionKey()?.length).toBe(32);
    vi.stubEnv(
      "TOQUE_ENCRYPTION_KEY",
      Buffer.alloc(32, 1).toString("base64url"),
    );
    expect(getEncryptionKey()).not.toBeNull();
    vi.stubEnv("TOQUE_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    expect(getEncryptionKey()).toBeNull();
    expect(getEncryptionKeyProblem()).toMatch(/32 bytes \(got 16\)/);
    expect(() => encryptSecret("x")).toThrow(/TOQUE_ENCRYPTION_KEY/);
    vi.stubEnv("TOQUE_ENCRYPTION_KEY", "not base64 at all!!");
    expect(getEncryptionKeyProblem()).toMatch(/not valid base64/);
    vi.stubEnv("TOQUE_ENCRYPTION_KEY", "");
    expect(getEncryptionKeyProblem()).toMatch(/not set/);
    expect(isGoogleConfigured()).toBe(false);
  });
});

describe("oauth state", () => {
  it("is valid for 10 minutes and only with our key", async () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const state = await createGoogleState(now);
    expect(await isGoogleStateValid(state, now)).toBe(true);
    expect(
      await isGoogleStateValid(state, new Date(now.getTime() + 11 * 60_000)),
    ).toBe(false);
    expect(await isGoogleStateValid(`${state}x`, now)).toBe(false);
    expect(await isGoogleStateValid(null, now)).toBe(false);
    vi.stubEnv(
      "TOQUE_SESSION_SECRET",
      "a-different-secret-that-is-long-enough",
    );
    expect(await isGoogleStateValid(state, now)).toBe(false);
  });

  it("builds the consent URL", async () => {
    const url = new URL(
      buildGoogleAuthUrl({
        redirectUri: "https://toque.example.pt/api/google/callback",
        state: "s",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-id",
      redirect_uri: "https://toque.example.pt/api/google/callback",
      response_type: "code",
      scope:
        "openid email https://www.googleapis.com/auth/calendar.app.created",
      access_type: "offline",
      prompt: "consent",
      state: "s",
    });
  });

  it("exchanges the code and reads the email", async () => {
    const fetchMock = createFetchMock([
      {
        body: {
          access_token: "at",
          expires_in: 3600,
          refresh_token: "rt",
          scope: "openid email",
          id_token: await createIdToken("eu@example.pt"),
        },
      },
    ]);
    const now = new Date("2026-10-09T10:00:00Z");
    const tokens = await exchangeGoogleCode(
      { code: "c", redirectUri: "http://localhost/api/google/callback", now },
      fetchMock,
    );
    expect(tokens).toMatchObject({
      accessToken: "at",
      refreshToken: "rt",
      email: "eu@example.pt",
    });
    expect(tokens.accessTokenExpiresAt.toISOString()).toBe(
      "2026-10-09T10:59:00.000Z",
    );
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "authorization_code",
      code: "c",
      client_secret: "client-secret",
    });
  });
});

describe("getGoogleAccessToken", () => {
  let db: Db;
  const now = new Date("2026-10-09T10:00:00Z");

  beforeEach(async () => {
    db = await createTestDb();
    await saveGoogleConnection(
      db,
      {
        accessToken: "old-access",
        accessTokenExpiresAt: new Date(now.getTime() + 60_000),
        refreshToken: "refresh-1",
        scope: "",
        email: "eu@example.pt",
      },
      now,
    );
  });

  it("reuses a valid token without calling Google", async () => {
    const fetchMock = createFetchMock([]);
    expect(await getGoogleAccessToken({ db, now, fetch: fetchMock })).toBe(
      "old-access",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const [row] = await db.select().from(googleConnection);
    expect(row.refreshTokenEncrypted).not.toContain("refresh-1");
  });

  it("refreshes an expired token and stores it", async () => {
    const later = new Date(now.getTime() + 5 * 60_000);
    const fetchMock = createFetchMock([
      { body: { access_token: "new-access", expires_in: 3600 } },
    ]);
    expect(
      await getGoogleAccessToken({ db, now: later, fetch: fetchMock }),
    ).toBe("new-access");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-1");
    // Cached afterwards.
    expect(
      await getGoogleAccessToken({
        db,
        now: later,
        fetch: createFetchMock([]),
      }),
    ).toBe("new-access");
  });

  it("refreshes when forced, even if the cached token looks valid", async () => {
    const fetchMock = createFetchMock([
      {
        body: {
          access_token: "forced-access",
          expires_in: 3600,
          refresh_token: "refresh-2",
        },
      },
    ]);
    expect(
      await getGoogleAccessToken({
        db,
        now,
        fetch: fetchMock,
        forceRefresh: true,
      }),
    ).toBe("forced-access");
    const row = await getGoogleConnection(db);
    expect(decryptSecret(row!.refreshTokenEncrypted)).toBe("refresh-2");
  });

  it("marks the connection broken on invalid_grant", async () => {
    const later = new Date(now.getTime() + 5 * 60_000);
    const fetchMock = createFetchMock([
      { status: 400, body: { error: "invalid_grant" } },
    ]);
    const error = await getGoogleAccessToken({
      db,
      now: later,
      fetch: fetchMock,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleAuthError);
    expect((error as GoogleAuthError).code).toBe("invalid_grant");
    const row = await getGoogleConnection(db);
    expect(row?.brokenAt).toEqual(later);
    expect(row?.lastError).toMatch(/Volta a ligar/);

    await expect(
      getGoogleAccessToken({ db, now: later, fetch: createFetchMock([]) }),
    ).rejects.toMatchObject({ code: "not_connected" });
  });

  it("keeps the calendar when the same account reconnects, resets it otherwise", async () => {
    await db.update(googleConnection).set({ calendarId: "cal-1" });
    const tokens = {
      accessToken: "a",
      accessTokenExpiresAt: now,
      refreshToken: "r",
      scope: "",
    };
    await saveGoogleConnection(db, { ...tokens, email: "eu@example.pt" }, now);
    expect((await getGoogleConnection(db))?.calendarId).toBe("cal-1");
    await saveGoogleConnection(
      db,
      { ...tokens, email: "outra@example.pt" },
      now,
    );
    expect((await getGoogleConnection(db))?.calendarId).toBeNull();
  });
});
