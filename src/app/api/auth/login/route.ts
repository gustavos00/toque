// POST /api/auth/login
// JSON { password } → 200 { ok: true, token } / 401. Sets the session cookie
// and returns the same token for native clients (Authorization: Bearer).

import { NextResponse, type NextRequest } from "next/server";
import {
  buildSessionCookie,
  createSessionToken,
  isPasswordCorrect,
} from "@/server/auth";
import { loginRequestSchema } from "@/shared/api";

const FAILED_LOGIN_DELAY_MS = 500;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const parsed = loginRequestSchema.safeParse(body);

  if (!parsed.success || !isPasswordCorrect(parsed.data.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return Response.json({ error: "Palavra-passe incorreta" }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true, token });
  response.cookies.set(buildSessionCookie(token, request));
  return response;
}
