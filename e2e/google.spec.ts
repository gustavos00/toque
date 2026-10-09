import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_GOOGLE_CLIENT_ID, E2E_NO_GOOGLE_PORT, E2E_PASSWORD, E2E_PORT } from "./env";
import { logInViaApi } from "./helpers";

// Only what works without a real Google account: nothing here reaches Google.
// (The token exchange runs on the server, out of Playwright's reach, so the
// callback specs check the redirect and that nothing got connected.)
const CALLBACK_URL = `http://localhost:${E2E_PORT}/api/google/callback`;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const NOT_CONNECTED = {
  connected: false,
  email: null,
  calendarName: null,
  lastError: null,
  lastSyncAt: null,
  demo: false,
  demoResetAt: null,
};

function getRedirectPath(location: string | undefined) {
  const url = new URL(location ?? "", "http://irrelevante");
  return `${url.pathname}${url.search}`;
}

async function getStatus(request: APIRequestContext) {
  const response = await request.get("/api/google/status");
  expect(response.status()).toBe(200);
  return response.json();
}

/** A well-formed JWT with the right audience but a bogus signature. */
function createUnsignedJwt() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ aud: "toque:google-oauth", iat: now, exp: now + 600, nonce: "x" });
  return `${header}.${payload}.assinatura-falsa`;
}

test.describe("Google Calendar (sem Google real)", () => {
  test.describe("sem sessão", () => {
    for (const path of ["/api/google/status", "/api/google/connect"]) {
      test(`${path} responde 401`, async ({ request }) => {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status()).toBe(401);
      });
    }
  });

  test.describe("com sessão", () => {
    test.beforeEach(async ({ page }) => {
      await logInViaApi(page.request);
    });

    test("o estado diz configurado mas não ligado", async ({ page }) => {
      expect(await getStatus(page.request)).toEqual({ configured: true, ...NOT_CONNECTED });
    });

    test("ligar redireciona para a Google com os parâmetros certos e sem cookies", async ({ page }) => {
      const response = await page.request.get("/api/google/connect", { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie")).toEqual([]);

      const location = new URL(response.headers()["location"] ?? "");
      expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTH_URL);
      const params = location.searchParams;
      expect(params.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
      expect(params.get("redirect_uri")).toBe(CALLBACK_URL);
      expect(params.get("response_type")).toBe("code");
      expect(new Set(params.get("scope")?.split(" "))).toEqual(
        new Set(["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"]),
      );
      // offline + consent → Google always returns a refresh token.
      expect(params.get("access_type")).toBe("offline");
      expect(params.get("prompt")).toBe("consent");
      expect(params.get("include_granted_scopes")).toBe("false");
      // Signed state: a JWT (header.payload.signature).
      expect(params.get("state")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    const badStates = [
      ["inválido", "?state=state-falso&code=codigo-falso"],
      ["em falta", "?code=codigo-falso"],
      ["mal assinado", `?state=${createUnsignedJwt()}&code=codigo-falso`],
    ] as const;
    for (const [label, query] of badStates) {
      test(`callback com state ${label} volta às Definições com erro e não liga a conta`, async ({ page }) => {
        const response = await page.request.get(`/api/google/callback${query}`, { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(getRedirectPath(response.headers()["location"])).toBe("/definicoes?google=erro");
        expect(await getStatus(page.request)).toEqual(expect.objectContaining({ connected: false }));
      });
    }

    test("desligar sem estar ligado devolve o estado desligado", async ({ page }) => {
      const response = await page.request.post("/api/google/disconnect");
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expect.objectContaining({ connected: false }));
    });

    test("ressincronizar sem estar ligado responde 409", async ({ page }) => {
      const response = await page.request.post("/api/google/resync");
      expect(response.status()).toBe(409);
      expect(await response.json()).toEqual(expect.objectContaining({ error: expect.any(String) }));
    });
  });

  test.describe("servidor sem configuração Google válida", () => {
    test.skip(
      process.env.E2E_SERVER === "dev",
      "Precisa de um segundo servidor com outra configuração; só existe no modo build (o Next 16 só permite um next dev por pasta).",
    );

    test("o estado diz não configurado e ligar volta às Definições", async ({ playwright }) => {
      const request = await playwright.request.newContext({ baseURL: `http://localhost:${E2E_NO_GOOGLE_PORT}` });
      const login = await request.post("/api/auth/login", { data: { password: E2E_PASSWORD } });
      expect(login.ok()).toBeTruthy();

      expect(await getStatus(request)).toEqual({ configured: false, ...NOT_CONNECTED });
      const response = await request.get("/api/google/connect", { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(getRedirectPath(response.headers()["location"])).toBe("/definicoes?google=config");
      await request.dispose();
    });
  });
});
