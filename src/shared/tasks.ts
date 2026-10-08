// Task kinds and their per-kind config. The DB stores `kind` as text and
// `config` as jsonb; these schemas are the only source of truth for both.
//
// To add a new kind: add its config schema, add a branch to
// `taskDefinitionSchema`, and handle it in the engine. No migration needed.

import { z } from "zod";

/** "HH:MM", 24h, local time (Europe/Lisbon). */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

/** "YYYY-MM-DD", local date (Europe/Lisbon). */
export const localDateSchema = z.iso.date();

function sortUnique<T extends string | number>(values: T[]) {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export const TASK_KINDS = ["timer", "until_ack", "recurring"] as const;
export const taskKindSchema = z.enum(TASK_KINDS);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const DEFAULT_UNTIL_ACK_TIMES = [
  "08:00",
  "13:00",
  "17:00",
  "19:00",
  "20:30",
  "21:30",
];
export const DEFAULT_TIMER_FORGOTTEN_MINUTES = [30, 60];
export const DEFAULT_RECURRING_REMINDER_TIME = "09:00";

/**
 * timer — fire-and-forget: a scan of a "start" tag starts a countdown and the
 * user is notified when it ends. "Forgotten" reminders then follow at each
 * offset (minutes after the end) — on by default; stop at a "complete" tag
 * scan or the "Já tratei" button.
 */
export const timerConfigSchema = z
  .object({
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    /** Optional heads-up N minutes before the end. */
    almostDoneEnabled: z.boolean().default(true),
    almostDoneMinutes: z.number().int().min(1).default(10),
    forgottenRemindersEnabled: z.boolean().default(true),
    /** Only used when forgottenRemindersEnabled. */
    forgottenReminderMinutes: z
      .array(
        z
          .number()
          .int()
          .min(1)
          .max(24 * 60),
      )
      .max(12)
      .default(DEFAULT_TIMER_FORGOTTEN_MINUTES)
      .transform(sortUnique),
  })
  // Only checked when the heads-up is on, so short timers still validate.
  .refine(
    (config) =>
      !config.almostDoneEnabled ||
      config.almostDoneMinutes < config.durationMinutes,
    {
      message: "O aviso tem de ser antes do fim",
      path: ["almostDoneMinutes"],
    },
  );
export type TimerConfig = z.infer<typeof timerConfigSchema>;

/**
 * until_ack — on scheduled days, notify at each `reminderTimes` slot until the
 * tag is scanned that day. A day is scheduled when its ISO weekday is in
 * `weekdays` or it is listed in `dates`, unless it is in `exceptDates`.
 */
export const untilAckConfigSchema = z
  .object({
    /** ISO weekdays: 1 = Monday … 7 = Sunday. */
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .default([])
      .transform(sortUnique),
    /** One-off extra days. */
    dates: z.array(localDateSchema).default([]).transform(sortUnique),
    /** Days to skip even if they match (holidays…). */
    exceptDates: z.array(localDateSchema).default([]).transform(sortUnique),
    reminderTimes: z
      .array(localTimeSchema)
      .min(1)
      .max(24)
      .default(DEFAULT_UNTIL_ACK_TIMES)
      .transform(sortUnique),
  })
  .refine((config) => config.weekdays.length > 0 || config.dates.length > 0, {
    message: "Indique pelo menos um dia da semana ou uma data",
    path: ["weekdays"],
  });
export type UntilAckConfig = z.infer<typeof untilAckConfigSchema>;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const isoWeekdaySchema = z.number().int().min(1).max(7);
export type IsoWeekday = number;

export const RECURRING_MODES = ["weekdays", "interval"] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

const recurringReminderTimeSchema = localTimeSchema.default(
  DEFAULT_RECURRING_REMINDER_TIME,
);

/** Due on each selected weekday, at `reminderTime`. */
const recurringWeekdaysConfigSchema = z.object({
  mode: z.literal("weekdays"),
  weekdays: z
    .array(isoWeekdaySchema)
    .min(1, "Escolhe pelo menos um dia")
    .transform(sortUnique),
  reminderTime: recurringReminderTimeSchema,
});

/** Due `everyDays` local days after the last scan, at `reminderTime`. */
const recurringIntervalConfigSchema = z.object({
  mode: z.literal("interval"),
  everyDays: z.number().int().min(1).max(365),
  reminderTime: recurringReminderTimeSchema,
});

/**
 * Fills in `mode` for configs that don't carry one: rows stored before modes
 * existed (`{ everyDays }`) are "interval"; anything else defaults to
 * "weekdays" (the default for new tasks).
 */
function addRecurringMode(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const config = input as Record<string, unknown>;
  if (config.mode !== undefined) {
    if (config.mode === "weekdays" && config.weekdays === undefined) {
      return { ...config, weekdays: [] }; // → "Escolhe pelo menos um dia"
    }
    return config;
  }
  if (config.everyDays !== undefined) return { ...config, mode: "interval" };
  return { weekdays: [], ...config, mode: "weekdays" };
}

/**
 * recurring — a chore that comes back. Two schedules:
 * - weekdays: due on each selected weekday at `reminderTime`;
 * - interval: due `everyDays` days after the last scan, at `reminderTime`.
 * Due stays due (overdue) until a scan; see getRecurringDueAt.
 */
export const recurringConfigSchema = z.preprocess(
  addRecurringMode,
  z.discriminatedUnion("mode", [
    recurringWeekdaysConfigSchema,
    recurringIntervalConfigSchema,
  ]),
);
export type RecurringConfig = z.output<typeof recurringConfigSchema>;
/** What a client may send (mode optional, see addRecurringMode). */
export type RecurringConfigInput =
  | z.input<typeof recurringWeekdaysConfigSchema>
  | z.input<typeof recurringIntervalConfigSchema>
  | Omit<z.input<typeof recurringIntervalConfigSchema>, "mode">;

/** `{ kind, config }` validated together. */
export const taskDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("timer"), config: timerConfigSchema }),
  z.object({ kind: z.literal("until_ack"), config: untilAckConfigSchema }),
  z.object({ kind: z.literal("recurring"), config: recurringConfigSchema }),
]);
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
export type TaskConfig = TaskDefinition["config"];

/** A task as used on the server (engine, routes). Dates are `Date`s. */
export type Task = TaskDefinition & {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Validates `{ kind, config }`, applying defaults. Throws a ZodError. */
export function parseTaskDefinition(input: unknown): TaskDefinition {
  return taskDefinitionSchema.parse(input);
}
