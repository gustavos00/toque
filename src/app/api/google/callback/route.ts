// GET /api/google/callback?code=&state= — Google redirects here after
// consent. No session (the app and Safari may not share cookies): the signed,
// 10-minute `state` from /api/google/connect is the check. Stores the tokens,
// creates the "Toque" calendar, then 302 → toque://definicoes (the app's deep link)?google=ok|erro|config
// (or =demo on the public demo, without touching anything).
// The first full sync runs after the response (after()), best effort.

import { after, NextResponse, type NextRequest } from "next/server";
import { ensureToqueCalendar, syncAllCalendarEvents } from "@/server/calendar";
import { getDb } from "@/server/db";
import { isDemoMode } from "@/shared/demo";
import {
  exchangeGoogleCode,
  getGoogleRedirectUri,
  GOOGLE_CALENDAR_SCOPE,
  isGoogleConfigured,
  isGoogleStateValid,
  saveGoogleConnection,
  setGoogleLastError,
} from "@/server/google";

type Outcome = "ok" | "erro" | "config" | "demo";

function redirectToSettings(_request: NextRequest, outcome: Outcome) {
  return NextResponse.redirect(
    new URL(`toque://definicoes?google=${outcome}`),
    302,
  );
}

export async function GET(request: NextRequest) {
  // The demo never exchanges codes or stores tokens.
  if (isDemoMode()) return redirectToSettings(request, "demo");
  const params = request.nextUrl.searchParams;
  if (!(await isGoogleStateValid(params.get("state")))) {
    return redirectToSettings(request, "erro");
  }
  if (!isGoogleConfigured()) return redirectToSettings(request, "config");
  const code = params.get("code");
  if (params.get("error") || !code) return redirectToSettings(request, "erro");

  const db = await getDb();
  try {
    const tokens = await exchangeGoogleCode({
      code,
      redirectUri: getGoogleRedirectUri(request),
    });
    const { refreshToken, email } = tokens;
    const hasCalendarScope = tokens.scope
      .split(" ")
      .includes(GOOGLE_CALENDAR_SCOPE);
    if (!refreshToken || !email || !hasCalendarScope) {
      console.error("Google consent incomplete", {
        hasRefreshToken: Boolean(refreshToken),
        hasEmail: Boolean(email),
        hasCalendarScope,
      });
      return redirectToSettings(request, "erro");
    }
    await saveGoogleConnection(db, { ...tokens, refreshToken, email });
  } catch (error) {
    console.error("Google code exchange failed", error);
    return redirectToSettings(request, "erro");
  }

  try {
    await ensureToqueCalendar();
  } catch (error) {
    console.error("Creating the Toque calendar failed", error);
    await setGoogleLastError(
      db,
      "Ligado ao Google, mas não foi possível criar o calendário Toque.",
    );
    return redirectToSettings(request, "erro");
  }

  // Fill the calendar right away instead of waiting for the next tick,
  // without holding the redirect (the sync can take a few seconds).
  after(async () => {
    try {
      await syncAllCalendarEvents(new Date());
    } catch (error) {
      console.error("Initial calendar sync failed", error);
      await setGoogleLastError(
        db,
        'Ligado ao Google, mas a primeira sincronização falhou. Tenta "Sincronizar agora".',
      ).catch(() => {});
    }
  });
  return redirectToSettings(request, "ok");
}
