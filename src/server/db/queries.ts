// Typed reads and row → DTO mappers shared by route handlers and the engine.

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { EventDto, TagDto, TaskDto, TaskStateDto } from "@/shared/api";
import { mergeSettings, type Settings } from "@/shared/settings";
import {
  taskDefinitionSchema,
  type Task,
  type TaskDefinition,
} from "@/shared/tasks";
import type { Db } from "./index";
import { events, settings, tags, tasks, taskState } from "./schema";

type TaskRow = typeof tasks.$inferSelect;
type TagRow = typeof tags.$inferSelect;
type TaskStateRow = typeof taskState.$inferSelect;
type EventRow = typeof events.$inferSelect;

/**
 * Row → Task. The config is re-validated (filling defaults added since it was
 * stored); if it no longer validates it is passed through untouched.
 */
export function buildTask(row: TaskRow): Task {
  const parsed = taskDefinitionSchema.safeParse({
    kind: row.kind,
    config: row.config,
  });
  const definition = parsed.success
    ? parsed.data
    : ({ kind: row.kind, config: row.config } as TaskDefinition);
  return {
    ...definition,
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getTaskById(db: Db, id: string): Promise<Task | null> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row ? buildTask(row) : null;
}

export async function getTagById(db: Db, id: string): Promise<TagRow | null> {
  const [row] = await db.select().from(tags).where(eq(tags.id, id));
  return row ?? null;
}

export async function getTagByToken(
  db: Db,
  token: string,
): Promise<TagRow | null> {
  const [row] = await db.select().from(tags).where(eq(tags.token, token));
  return row ?? null;
}

/** Stored settings merged over the defaults (never throws on old shapes). */
export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  try {
    return mergeSettings(row?.data);
  } catch {
    return mergeSettings(undefined);
  }
}

/** Upserts the single settings row (pass an already validated value). */
export async function saveSettings(db: Db, value: Settings): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, data: value })
    .onConflictDoUpdate({
      target: settings.id,
      set: { data: value, updatedAt: new Date() },
    });
}

/** Random URL-safe tag token: 18 bytes → 24 base64url characters. */
export function createTagToken(): string {
  return randomBytes(18).toString("base64url");
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function buildTaskStateDto(
  row: TaskStateRow | null | undefined,
): TaskStateDto | null {
  if (!row) return null;
  return {
    timerStartedAt: toIso(row.timerStartedAt),
    timerEndsAt: toIso(row.timerEndsAt),
    lastDoneAt: toIso(row.lastDoneAt),
    lastAckDate: row.lastAckDate,
    snoozedUntil: toIso(row.snoozedUntil),
  };
}

export function buildTaskDto(
  task: Task,
  state: TaskStateRow | null | undefined,
): TaskDto {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    state: buildTaskStateDto(state),
  };
}

/** `baseUrl` is the public origin, e.g. "https://toque.example.pt". */
export function buildTagDto(row: TagRow, baseUrl: string): TagDto {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    taskId: row.taskId,
    action: row.action,
    url: `${baseUrl.replace(/\/+$/, "")}/t/${row.token}`,
    createdAt: row.createdAt.toISOString(),
    lastScannedAt: toIso(row.lastScannedAt),
  };
}

export function buildEventDto(
  row: EventRow,
  taskName: string | null,
): EventDto {
  return {
    id: String(row.id),
    at: row.at.toISOString(),
    type: row.type,
    taskId: row.taskId,
    taskName,
    tagId: row.tagId,
    data: row.data,
  };
}

/** TOQUE_PUBLIC_URL when set, otherwise the request's own origin. */
export function getPublicBaseUrl(request: Request): string {
  const configured = process.env.TOQUE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
