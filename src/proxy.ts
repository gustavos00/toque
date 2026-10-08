// Protects the app pages: no valid session → redirect to /login?next=<path>.
// Not applied to /api (route handlers answer 401 themselves), /t/<token>
// (the tag token is the credential), /login, Next internals and any file
// with an extension (manifest, icons, service worker…).

import { NextResponse, type NextRequest } from "next/server";
import {
  isSessionTokenValid,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await isSessionTokenValid(token)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/")
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/|t/|_next/|login|.*\\..*).*)"],
};
