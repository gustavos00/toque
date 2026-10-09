// GET   /api/settings → SettingsDto (defaults filled in)
// PATCH /api/settings  body UpdateSettingsRequest → SettingsDto
// Demo: ntfy.topic is always null and a PATCH touching `ntfy` → 403.

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { getSettings, saveSettings } from "@/server/db/queries";
import { rescheduleAllTasks } from "@/server/engine";
import {
  mergeSettings,
  settingsSchema,
  updateSettingsRequestSchema,
} from "@/shared/settings";
import { isDemoMode } from "@/shared/demo";
import {
  createDemoBlockedResponse,
  parseJsonBody,
  parseValue,
} from "../_lib/http";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  return Response.json(await getSettings(await getDb()));
}

export async function PATCH(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const parsed = await parseJsonBody(request, updateSettingsRequestSchema);
  if (!parsed.ok) return parsed.response;
  // ntfy is blocked on the public demo; the other sections stay editable.
  if (isDemoMode() && parsed.data.ntfy !== undefined) {
    return createDemoBlockedResponse();
  }

  const db = await getDb();
  const current = await getSettings(db);
  // Merge without validating first, so the 400 can carry the zod issues.
  const merged = parseValue(
    {
      quietHours: { ...current.quietHours, ...parsed.data.quietHours },
      ntfy: { ...current.ntfy, ...parsed.data.ntfy },
      defaults: { ...current.defaults, ...parsed.data.defaults },
    },
    settingsSchema,
  );
  if (!merged.ok) return merged.response;

  const next = mergeSettings(merged.data);
  await saveSettings(db, next);
  await rescheduleAllTasks(new Date());
  return Response.json(next);
}
