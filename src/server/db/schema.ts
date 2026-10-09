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

/**
 * Google Calendar connection, single row (id = 1). Tokens are encrypted with
 * AES-256-GCM (TOQUE_ENCRYPTION_KEY, see src/server/google/crypto.ts).
 * Connected = row exists and broken_at is null.
 */
export const googleConnection = pgTable(
  "google_connection",
  {
    id: smallint("id").primaryKey().default(1),
    /** Google account email (from the id_token). */
    email: text("email").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    /** Scopes Google actually granted (space separated). */
    scope: text("scope").notNull().default(""),
    /** The "Toque" calendar; null until the calendar module creates it. */
    calendarId: text("calendar_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set when Google rejects the refresh token (revoked / expired). */
    brokenAt: timestamp("broken_at", { withTimezone: true }),
    /** Last error shown in settings (auth or sync), Portuguese. */
    lastError: text("last_error"),
    /** Last successful full or partial sync (written by the calendar module). */
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [check("google_connection_single_row", sql`${table.id} = 1`)],
);

/**
 * One row per Google Calendar event the app manages. `occurrence_key`
 * identifies the occurrence within a task (e.g. "2026-10-13" or a timer
 * run); `content_hash` lets the sync skip unchanged events. A deleted task
 * sets task_id to null (instead of cascading) so the sync can still find
 * and delete its Google events; deleted_at marks rows whose Google event
 * is gone.
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    occurrenceKey: text("occurrence_key").notNull(),
    /** Null until the event has been created in Google. */
    googleEventId: text("google_event_id"),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("calendar_events_task_occurrence_unique").on(
      table.taskId,
      table.occurrenceKey,
    ),
    index("calendar_events_live_idx")
      .on(table.taskId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

/**
 * Public demo bookkeeping, single row (id = 1). The demo wipes its data every
 * few minutes (see src/server/db/demo.ts); unused outside demo mode.
 */
export const demoState = pgTable(
  "demo_state",
  {
    id: smallint("id").primaryKey().default(1),
    lastResetAt: timestamp("last_reset_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("demo_state_single_row", sql`${table.id} = 1`)],
);
