// App-wide settings, stored as one jsonb row (settings.id = 1).

import { z } from "zod";
import {
  DEFAULT_RECURRING_REMINDER_TIME,
  DEFAULT_TIMER_FORGOTTEN_MINUTES,
  DEFAULT_UNTIL_ACK_TIMES,
  localTimeSchema,
} from "./tasks";

/** No notifications are sent between start and end (may cross midnight). */
const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: localTimeSchema,
  end: localTimeSchema,
});

const ntfySchema = z.object({
  server: z.url(),
  /** Topic name; null = notifications disabled. Treat it like a secret. */
  topic: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "Só letras, números, _ e -")
    .nullable(),
});

/** Defaults the PWA pre-fills in new tasks, plus the snooze length. */
const notificationDefaultsSchema = z.object({
  snoozeMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  untilAckReminderTimes: z.array(localTimeSchema).min(1).max(24),
  timerForgottenReminderMinutes: z
    .array(
      z
        .number()
        .int()
        .min(1)
        .max(24 * 60),
    )
    .max(12),
  recurringReminderTime: localTimeSchema,
});

/** Full settings. Missing sections/fields fall back to DEFAULT_SETTINGS. */
export const settingsSchema = z.object({
  quietHours: quietHoursSchema,
  ntfy: ntfySchema,
  defaults: notificationDefaultsSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  quietHours: { enabled: true, start: "23:00", end: "07:30" },
  ntfy: { server: "https://ntfy.sh", topic: null },
  defaults: {
    snoozeMinutes: 30,
    untilAckReminderTimes: DEFAULT_UNTIL_ACK_TIMES,
    timerForgottenReminderMinutes: DEFAULT_TIMER_FORGOTTEN_MINUTES,
    recurringReminderTime: DEFAULT_RECURRING_REMINDER_TIME,
  },
};

/** PATCH /api/settings body: any subset of sections, merged field by field. */
export const updateSettingsRequestSchema = z.object({
  quietHours: quietHoursSchema.partial().optional(),
  ntfy: ntfySchema.partial().optional(),
  defaults: notificationDefaultsSchema.partial().optional(),
});
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/**
 * Merges a stored (possibly partial or outdated) value and an optional patch
 * over the defaults, then validates. Throws a ZodError if the result is invalid.
 */
export function mergeSettings(
  stored: unknown,
  patch: UpdateSettingsRequest = {},
): Settings {
  const base = isRecord(stored) ? stored : {};
  const merged = Object.fromEntries(
    (["quietHours", "ntfy", "defaults"] as const).map((section) => [
      section,
      {
        ...DEFAULT_SETTINGS[section],
        ...(isRecord(base[section]) ? base[section] : {}),
        ...patch[section],
      },
    ]),
  );
  return settingsSchema.parse(merged);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
