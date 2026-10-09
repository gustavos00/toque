// HTTP contract for /api/*. Requests are validated with these schemas on the
// server; responses are plain JSON (dates as ISO 8601 strings).
// All /api routes except /api/auth/login and /api/tick need the session cookie.

import { z } from "zod";
import type { EventType } from "./events";
import type { TimerPhase } from "./schedule";
import type { Settings } from "./settings";
import { tagActionSchema, type TagAction } from "./tags";
import {
  taskDefinitionSchema,
  taskKindSchema,
  type TaskDefinition,
} from "./tasks";
import type { LocalDate } from "./time";

/** ISO 8601 timestamp, e.g. "2026-10-09T14:40:00.000Z". */
export type IsoDateTime = string;

/** Every non-2xx JSON response. `issues` comes from zod on 400s. */
export type ApiError = { error: string; issues?: unknown };

// ---------- Auth ----------

/** POST /api/auth/login — JSON or form-encoded. Form posts get a 303 redirect. */
export const loginRequestSchema = z.object({ password: z.string().min(1) });

// ---------- Tasks ----------

const taskNameSchema = z.string().trim().min(1).max(80);

/** POST /api/tasks */
export const createTaskRequestSchema = z.intersection(
  z.object({ name: taskNameSchema, enabled: z.boolean().default(true) }),
  taskDefinitionSchema,
);
export type CreateTaskRequest = z.input<typeof createTaskRequestSchema>;

/**
 * PATCH /api/tasks/:id — every field optional. `kind`/`config` are validated
 * together against the task's current values (changing kind needs a config).
 */
export const updateTaskRequestSchema = z.object({
  name: taskNameSchema.optional(),
  enabled: z.boolean().optional(),
  kind: taskKindSchema.optional(),
  config: z.unknown().optional(),
});
export type UpdateTaskRequest = z.input<typeof updateTaskRequestSchema>;

/** Engine runtime state of a task (null fields = not applicable / never). */
export type TaskStateDto = {
  timerStartedAt: IsoDateTime | null;
  timerEndsAt: IsoDateTime | null;
  lastDoneAt: IsoDateTime | null;
  /** Local day the until_ack task was last acknowledged. */
  lastAckDate: LocalDate | null;
  snoozedUntil: IsoDateTime | null;
};

/** A tag linked to a task, as listed inside TaskDto. */
export type TaskTagDto = { id: string; label: string; action: TagAction };

export type TaskDto = TaskDefinition & {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  state: TaskStateDto | null;
  /** Tags currently assigned to this task, by label. */
  tags: TaskTagDto[];
};

// ---------- Tags ----------

/** POST /api/tags — the server generates the token. */
export const createTagRequestSchema = z.object({
  label: z.string().trim().min(1).max(80),
  taskId: z.uuid().nullable().default(null),
  action: tagActionSchema.default("start"),
});
export type CreateTagRequest = z.input<typeof createTagRequestSchema>;

/** PATCH /api/tags/:id — rename, reassign (taskId null = unassign), change action. */
export const updateTagRequestSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  taskId: z.uuid().nullable().optional(),
  action: tagActionSchema.optional(),
});
export type UpdateTagRequest = z.input<typeof updateTagRequestSchema>;

export type TagDto = {
  id: string;
  token: string;
  label: string;
  taskId: string | null;
  action: TagAction;
  /** The URL to write to the NFC tag: <public url>/t/<token>. */
  url: string;
  createdAt: IsoDateTime;
  lastScannedAt: IsoDateTime | null;
};

// ---------- Events (history) ----------

/** GET /api/events?limit=&beforeId=&taskId=&type= — newest first. */
export const listEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Cursor: only events with a smaller id (= recorded earlier). */
  beforeId: z.string().regex(/^\d+$/).optional(),
  taskId: z.uuid().optional(),
  type: z.string().optional(),
});

export type EventDto = {
  /** Increasing with insertion order (bigint as string). */
  id: string;
  at: IsoDateTime;
  type: EventType;
  taskId: string | null;
  /** Current task name (null if unassigned or deleted). */
  taskName: string | null;
  tagId: string | null;
  data: Record<string, unknown>;
};

/** GET /api/events */
export type EventListDto = {
  events: EventDto[];
  /** Pass as `beforeId` to get the next page; null when there are no more. */
  nextBeforeId: string | null;
};

// ---------- Settings ----------

/** GET /api/settings and PATCH /api/settings (body: UpdateSettingsRequest). */
export type SettingsDto = Settings;

// ---------- Dashboard ----------

/** GET /api/dashboard — only enabled tasks. */
export type DashboardDto = {
  now: IsoDateTime;
  /** Local date the summary refers to. */
  today: LocalDate;
  /**
   * Every timer task with its phase (see getTimerPhase): ready first, then
   * running (soonest end first), then handled, then idle.
   * `handledAt` = state.lastDoneAt when phase is "handled", else null.
   */
  timers: {
    task: TaskDto;
    phase: TimerPhase;
    startedAt: IsoDateTime | null;
    endsAt: IsoDateTime | null;
    handledAt: IsoDateTime | null;
  }[];
  /** until_ack tasks scheduled today, pending first. */
  untilAckToday: { task: TaskDto; acked: boolean }[];
  /**
   * All recurring tasks, soonest due first (see getRecurringDueAt).
   * overdue = now >= dueAt; nextDueAt = when it would be due if done now
   * ("próxima: terça").
   */
  recurring: {
    task: TaskDto;
    lastDoneAt: IsoDateTime | null;
    dueAt: IsoDateTime;
    overdue: boolean;
    nextDueAt: IsoDateTime;
  }[];
  /** Latest 10 events. */
  recentEvents: EventDto[];
};

// ---------- Google Calendar ----------

/** GET /api/google/status (also returned by disconnect and resync). */
export type GoogleStatusDto = {
  /** Public demo: Google is blocked; every other field is empty/false. */
  demo: boolean;
  /** Demo only: when all data is next wiped (every 5 min); null otherwise. */
  demoResetAt: IsoDateTime | null;
  /** GOOGLE_CLIENT_ID/SECRET and TOQUE_ENCRYPTION_KEY are set on the server. */
  configured: boolean;
  /** A connection exists and Google has not rejected it. */
  connected: boolean;
  /** Connected Google account (kept when the connection broke). */
  email: string | null;
  /** "Toque" once the app's calendar exists, else null. */
  calendarName: string | null;
  /** Portuguese message for the settings page (auth or sync problem). */
  lastError: string | null;
  lastSyncAt: IsoDateTime | null;
};

// ---------- App info ----------

/** GET /api/app-info — public (no session), e.g. for the login page. */
export type AppInfoDto = {
  /** Public demo deployment (Google and ntfy blocked, password "demo"). */
  demo: boolean;
  /** Demo only: when all data is next wiped (every 5 min); null otherwise. */
  demoResetAt: IsoDateTime | null;
};
