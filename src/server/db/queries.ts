// Typed reads and row → DTO mappers shared by route handlers and the engine.

import { randomBytes } from "node:crypto";
import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import type {
  EventDto,
  TagDto,
  TaskDto,
  TaskStateDto,
  TaskTagDto,
} from "@/shared/api";
import { isDemoMode } from "@/shared/demo";
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

/** Stored settings merged over the defaults. The demo never has an ntfy topic. */
export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  let value: Settings;
  try {
    value = mergeSettings(row?.data);
  } catch {
    value = mergeSettings(undefined);
  }
  return removeDemoSecrets(value);
}

function removeDemoSecrets(value: Settings): Settings {
  return isDemoMode()
    ? { ...value, ntfy: { ...value.ntfy, topic: null } }
    : value;
}

/** Upserts the single settings row (pass an already validated value). */
export async function saveSettings(db: Db, input: Settings): Promise<void> {
  const value = removeDemoSecrets(input);
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
  taskTags: TaskTagDto[],
): TaskDto {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    state: buildTaskStateDto(state),
    tags: taskTags,
  };
}

/**
 * Tags grouped by task id, in one query. Pass task ids to limit it; omit to
 * get every assigned tag. Tasks without tags are absent from the map.
 */
export async function getTagsByTaskId(
  db: Db,
  taskIds?: string[],
): Promise<Map<string, TaskTagDto[]>> {
  const grouped = new Map<string, TaskTagDto[]>();
  if (taskIds?.length === 0) return grouped;
  const rows = await db
    .select({
      id: tags.id,
      label: tags.label,
      action: tags.action,
      taskId: tags.taskId,
    })
    .from(tags)
    .where(taskIds ? inArray(tags.taskId, taskIds) : isNotNull(tags.taskId))
    .orderBy(asc(tags.label));
  for (const { taskId, ...tag } of rows) {
    if (!taskId) continue;
    const list = grouped.get(taskId) ?? [];
    list.push(tag);
    grouped.set(taskId, list);
  }
  return grouped;
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

function removeUserAgent(data: Record<string, unknown>) {
  if (!("userAgent" in data)) return data;
  const rest = { ...data };
  delete rest.userAgent;
  return rest;
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
    data: isDemoMode() ? removeUserAgent(row.data) : row.data,
  };
}

/** TOQUE_PUBLIC_URL when set, otherwise the request's own origin. */
export function getPublicBaseUrl(request: Request): string {
  const configured = process.env.TOQUE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
