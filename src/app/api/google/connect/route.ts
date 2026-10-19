// GET /api/google/connect — starts the Google OAuth consent.
// 302 → accounts.google.com (signed `state`, no cookie), or
// 302 → toque://definicoes?google=config when the server lacks Google env, or
// 302 → toque://definicoes?google=demo on the public demo.

import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { isDemoMode } from "@/shared/demo";
import {
  buildGoogleAuthUrl,
  createGoogleState,
  getGoogleRedirectUri,
  isGoogleConfigured,
} from "@/server/google";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  if (isDemoMode()) {
    return NextResponse.redirect(
      new URL("toque://definicoes?google=demo"),
      302,
    );
  }

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("toque://definicoes?google=config"),
      302,
    );
  }
  const authUrl = buildGoogleAuthUrl({
    redirectUri: getGoogleRedirectUri(request),
    state: await createGoogleState(),
  });
  return NextResponse.redirect(authUrl, 302);
}
