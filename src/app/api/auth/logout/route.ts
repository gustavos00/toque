// POST /api/auth/logout — clears the session cookie.
// Form posts get a 303 to /login; fetch calls get 204.

import { NextResponse, type NextRequest } from "next/server";
import { buildClearedSessionCookie } from "@/server/auth";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const isForm =
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data");
  const response = isForm
    ? NextResponse.redirect(new URL("/login", request.url), 303)
    : new NextResponse(null, { status: 204 });
  response.cookies.set(buildClearedSessionCookie(request));
  return response;
}
