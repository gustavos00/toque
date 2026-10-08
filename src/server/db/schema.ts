// Drizzle schema. After changing it run `npm run db:generate` and commit the
// new files in drizzle/. Typed JSON columns are validated with the zod schemas
// in src/shared before being written.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { EventType } from "@/shared/events";
import type {
  NotificationKind,
  NotificationPayload,
} from "@/shared/notifications";
import type { TagAction } from "@/shared/tags";
import type { TaskConfig, TaskKind } from "@/shared/tasks";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** A chore. `config` shape depends on `kind` (see src/shared/tasks.ts). */
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").$type<TaskKind>().notNull(),
  config: jsonb("config").$type<TaskConfig>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A physical NFC tag. The token is the credential in /t/<token>. */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    label: text("label").notNull(),
    /** Null = not assigned; a tag can be moved to another task. */
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    /** What a scan does to the task (see src/shared/tags.ts). */
    action: text("action").$type<TagAction>().notNull().default("start"),
    createdAt: createdAt(),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tags_token_unique").on(table.token),
    index("tags_task_id_idx").on(table.taskId),
  ],
);

/**
 * Engine runtime state, one row per task (created lazily by the engine with
 * an upsert). Columns are shared across kinds; `extra` is for future kinds.
 */
export const taskState = pgTable("task_state", {
  taskId: uuid("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  /** timer: when the running countdown started; null = not running. */
  timerStartedAt: timestamp("timer_started_at", { withTimezone: true }),
  /** timer: when the running countdown ends; null = not running. */
  timerEndsAt: timestamp("timer_ends_at", { withTimezone: true }),
  /** recurring / timer: last time the task was completed. */
  lastDoneAt: timestamp("last_done_at", { withTimezone: true }),
  /** until_ack: local date (Europe/Lisbon) of the last acknowledgement. */
  lastAckDate: date("last_ack_date", { mode: "string" }),
  /** Any kind: notifications for this task are held until this instant. */
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/** Append-only history: scans and everything the engine does. */
export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").$type<EventType>().notNull(),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("events_at_idx").on(table.at),
    index("events_task_id_at_idx").on(table.taskId, table.at),
  ],
);

/**
 * Outbox of scheduled notifications. The engine inserts rows; the tick sends
 * every row with due_at <= now and sent_at/cancelled_at null, then stamps
 * sent_at (or bumps attempts + last_error on failure). Cancel = set
 * cancelled_at. `dedupe_key` (unique) makes scheduling idempotent, e.g.
 * "until_ack:<taskId>:2026-10-09:13:00".
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    dedupeKey: text("dedupe_key"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
    index("notifications_pending_due_idx")
      .on(table.dueAt)
      .where(sql`${table.sentAt} is null and ${table.cancelledAt} is null`),
    index("notifications_task_id_idx").on(table.taskId),
  ],
);

/** Single row (id = 1). `data` is validated with settingsSchema. */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [check("settings_single_row", sql`${table.id} = 1`)],
);
