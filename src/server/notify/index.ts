import type {
  NotificationKind,
  NotificationPayload,
} from "@/shared/notifications";
import { isDemoMode } from "@/shared/demo";
import { DEFAULT_SETTINGS, type Settings } from "@/shared/settings";
import {
  ACTION_TOKEN_TTL_MS,
  createActionUrl,
  getActionSecret,
} from "./action-token";
import { createNtfyNotifier } from "./ntfy";
import type {
  NotificationButton,
  Notifier,
  OutgoingNotification,
} from "./types";

export type { Notifier, OutgoingNotification } from "./types";
export {
  createActionUrl,
  readSignedActionParams,
  verifyActionToken,
  type NotificationAction,
  type SignedActionParams,
} from "./action-token";
export { createNtfyNotifier } from "./ntfy";

/**
 * Public origin of the app for click/action URLs: TOQUE_PUBLIC_URL, else Vercel's
 * production domain. Null → notifications go out without buttons or click URL.
 */
export function getAppBaseUrl(): string | null {
  const configured = process.env.TOQUE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/**
 * The ntfy notifier, or null when no topic is configured (rows then stay pending and the
 * catch-up rule sends the latest one once a topic exists).
 * Settings win when set; env vars are the fallback: topic = settings || NTFY_TOPIC,
 * server = settings (if changed from the built-in https://ntfy.sh) || NTFY_BASE_URL || https://ntfy.sh.
 * NTFY_TOKEN is env-only (secret). Always null in demo mode.
 */
export function createNotifierFromSettings(
  settings: Settings,
): Notifier | null {
  // Public demo: never send to ntfy, whatever the settings or env say.
  if (isDemoMode()) return null;
  const topic = settings.ntfy.topic || process.env.NTFY_TOPIC?.trim();
  if (!topic) return null;
  const configuredServer =
    settings.ntfy.server !== DEFAULT_SETTINGS.ntfy.server
      ? settings.ntfy.server
      : null;
  return createNtfyNotifier({
    baseUrl:
      configuredServer ||
      process.env.NTFY_BASE_URL?.trim() ||
      DEFAULT_SETTINGS.ntfy.server,
    topic,
    token: process.env.NTFY_TOKEN?.trim() || null,
  });
}

function formatSnoozeLabel(minutes: number): string {
  if (minutes % 60 === 0) return `Adiar ${minutes / 60} h`;
  return `Adiar ${minutes} min`;
}

/** Maps an outbox payload to what the provider sends, signing the "Feito"/"Adiar" buttons. */
export function buildOutgoingNotification(input: {
  kind: NotificationKind;
  payload: NotificationPayload;
  taskId: string | null;
  /** Occurrence the row belongs to (see engine/keys.ts); null → no action buttons. */
  occurrence: string | null;
  now: Date;
  snoozeMinutes: number;
  baseUrl?: string | null;
  secret?: string | null;
}): OutgoingNotification {
  const { payload, taskId, occurrence, now } = input;
  const baseUrl = input.baseUrl === undefined ? getAppBaseUrl() : input.baseUrl;
  const secret = input.secret === undefined ? getActionSecret() : input.secret;
  const expiresAt = new Date(now.getTime() + ACTION_TOKEN_TTL_MS);
  const buttons: NotificationButton[] = [];

  if (baseUrl && secret && taskId && occurrence) {
    if (payload.actions.includes("done")) {
      buttons.push({
        label: input.kind === "timer_forgotten" ? "Já tratei" : "Feito",
        url: createActionUrl({
          baseUrl,
          action: "done",
          taskId,
          occurrence,
          expiresAt,
          secret,
        }),
        method: "POST",
        clear: true,
      });
    }
    if (payload.actions.includes("snooze")) {
      buttons.push({
        label: formatSnoozeLabel(input.snoozeMinutes),
        url: createActionUrl({
          baseUrl,
          action: "snooze",
          taskId,
          occurrence,
          expiresAt,
          secret,
        }),
        method: "POST",
        clear: true,
      });
    }
  }

  return {
    title: payload.title,
    message: payload.message,
    priority: payload.priority,
    tags: payload.tags,
    clickUrl:
      baseUrl && payload.actions.includes("open") ? `${baseUrl}/` : null,
    buttons,
  };
}
