// /api/scan/:token — backs the app's tag popup (opened by the Universal Link /t/<token>).
// No session: the tag token is the credential.
//   GET  → TagScanInfo (nothing is recorded; 404 for unknown tokens)
//   POST { action?: "done" | "snooze" } → ScanResult  ("done" records the scan, the default)

import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getTagScanInfo,
  recordTagScan,
  snoozeTagTask,
} from "@/server/engine/scan";
import { createErrorResponse, parseJsonBody } from "../../_lib/http";

const bodySchema = z.object({
  action: z.enum(["done", "snooze"]).default("done"),
});

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/scan/[token]">,
) {
  const { token } = await ctx.params;
  const info = await getTagScanInfo(token);
  if (!info) return createErrorResponse(404, "Etiqueta não encontrada");
  return Response.json(info, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/scan/[token]">,
) {
  const { token } = await ctx.params;
  // An empty body means "done".
  const text = await request.text();
  const body = text.trim()
    ? await parseJsonBody(
        new Request(request.url, { method: "POST", body: text }),
        bodySchema,
      )
    : { ok: true as const, data: bodySchema.parse({}) };
  if (!body.ok) return body.response;
  const now = new Date();
  const outcome =
    body.data.action === "snooze"
      ? await snoozeTagTask(token, now)
      : await recordTagScan(token, {
          now,
          userAgent: request.headers.get("user-agent"),
        });
  return Response.json(outcome.result, { status: outcome.status });
}
