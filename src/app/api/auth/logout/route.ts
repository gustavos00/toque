// POST /api/auth/logout — clears the session cookie (204).

import { NextResponse, type NextRequest } from "next/server";
import { buildClearedSessionCookie } from "@/server/auth";

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(buildClearedSessionCookie(request));
  return response;
}
