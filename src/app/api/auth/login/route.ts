// POST /api/auth/login
// - JSON { password } → 200 { ok: true } / 401, sets the session cookie.
// - Form (password, optional next) → 303 to `next` (or /) / 303 to /login?error=1.

import { NextResponse, type NextRequest } from "next/server";
import {
  buildSessionCookie,
  createSessionToken,
  isPasswordCorrect,
} from "@/server/auth";
import { loginRequestSchema } from "@/shared/api";

const FAILED_LOGIN_DELAY_MS = 500;

function isFormRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  );
}

/** Only same-site relative paths, to avoid open redirects. */
function getSafeNextPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  return value;
}

async function readLoginBody(
  request: NextRequest,
): Promise<{ password: unknown; next: unknown }> {
  if (isFormRequest(request)) {
    const form = await request.formData();
    return { password: form.get("password"), next: form.get("next") };
  }
  try {
    const body = await request.json();
    return { password: body?.password, next: body?.next };
  } catch {
    return { password: undefined, next: undefined };
  }
}

export async function POST(request: NextRequest) {
  const isForm = isFormRequest(request);
  const body = await readLoginBody(request);
  const parsed = loginRequestSchema.safeParse({ password: body.password });

  if (!parsed.success || !isPasswordCorrect(parsed.data.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    if (isForm) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "1");
      const nextPath = getSafeNextPath(body.next);
      if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(loginUrl, 303);
    }
    return Response.json({ error: "Palavra-passe incorreta" }, { status: 401 });
  }

  const response = isForm
    ? NextResponse.redirect(
        new URL(getSafeNextPath(body.next), request.url),
        303,
      )
    : NextResponse.json({ ok: true });
  response.cookies.set(buildSessionCookie(await createSessionToken(), request));
  return response;
}
