import { createHmac, timingSafeEqual } from "node:crypto";

/** Buttons on a notification. Each maps to POST /api/actions/<action>. */
export const NOTIFICATION_ACTIONS = ["done", "snooze"] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

/** How long a notification button keeps working. */
export const ACTION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Query parameters carried by a signed action URL. */
export type SignedActionParams = { action: string; taskId: string; occurrence: string; exp: string; sig: string };

type VerifyFailure = "bad_action" | "malformed" | "expired" | "bad_signature" | "no_secret";

export function getActionSecret(): string | null {
  const secret = process.env.TOQUE_ACTION_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function isNotificationAction(value: string): value is NotificationAction {
  return (NOTIFICATION_ACTIONS as readonly string[]).includes(value);
}

/** Occurrence ids: local dates ("2026-10-09") or cycle start ms. */
const OCCURRENCE_RE = /^[0-9-]{1,32}$/;

/**
 * HMAC-SHA256 over "v2.<action>.<taskId>.<occurrence>.<exp>", base64url. The occurrence binds a
 * button to the alert it was sent for, so yesterday's "Feito" can't complete today.
 * v1 links (no occurrence) are rejected: they can't be bound, and expire within 24 h anyway.
 */
export function signAction(
  action: NotificationAction,
  taskId: string,
  occurrence: string,
  exp: number,
  secret: string,
): string {
  return createHmac("sha256", secret).update(`v2.${action}.${taskId}.${occurrence}.${exp}`).digest("base64url");
}

/**
 * `<baseUrl>/api/actions/<action>?task=<id>&occ=<occurrence>&exp=<unix seconds>&sig=<hmac>`.
 * Only the task id goes in the URL — it is not a secret, the signature is what authorises.
 */
export function createActionUrl(input: {
  baseUrl: string;
  action: NotificationAction;
  taskId: string;
  occurrence: string;
  expiresAt: Date;
  secret: string;
}): string {
  const exp = Math.floor(input.expiresAt.getTime() / 1000);
  const url = new URL(`/api/actions/${input.action}`, input.baseUrl);
  url.searchParams.set("task", input.taskId);
  url.searchParams.set("occ", input.occurrence);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", signAction(input.action, input.taskId, input.occurrence, exp, input.secret));
  return url.toString();
}

/** Pulls `{ action, taskId, occurrence, exp, sig }` from a request URL whose path ends in /api/actions/<action>. */
export function readSignedActionParams(url: URL, action: string): SignedActionParams {
  return {
    action,
    taskId: url.searchParams.get("task") ?? "",
    occurrence: url.searchParams.get("occ") ?? "",
    exp: url.searchParams.get("exp") ?? "",
    sig: url.searchParams.get("sig") ?? "",
  };
}

/** Constant-time verification of a signed action. */
export function verifyActionToken(
  params: SignedActionParams,
  now: Date,
  secret: string | null = getActionSecret(),
): { ok: true; action: NotificationAction; taskId: string; occurrence: string } | { ok: false; reason: VerifyFailure } {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!isNotificationAction(params.action)) return { ok: false, reason: "bad_action" };
  if (!/^\d{1,12}$/.test(params.exp) || !params.taskId || !params.sig || !OCCURRENCE_RE.test(params.occurrence)) {
    return { ok: false, reason: "malformed" };
  }
  const exp = Number(params.exp);
  const expected = Buffer.from(signAction(params.action, params.taskId, params.occurrence, exp, secret));
  const given = Buffer.from(params.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, action: params.action, taskId: params.taskId, occurrence: params.occurrence };
}
