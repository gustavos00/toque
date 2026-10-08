// History queries used by /api/events and /api/dashboard.

import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { EventDto } from "@/shared/api";
import type { Db } from "./index";
import { buildEventDto } from "./queries";
import { events, tasks } from "./schema";

type ListEventsOptions = {
  limit: number;
  /** Only events with a smaller id (recorded earlier). */
  beforeId?: number;
  taskId?: string;
  type?: string;
};

/** Newest first (by insertion order), with the task's current name. */
export async function listEvents(
  db: Db,
  options: ListEventsOptions,
): Promise<EventDto[]> {
  const conditions: SQL[] = [];
  if (options.beforeId !== undefined)
    conditions.push(lt(events.id, options.beforeId));
  if (options.taskId) conditions.push(eq(events.taskId, options.taskId));
  if (options.type)
    conditions.push(eq(events.type, options.type as EventDto["type"]));

  const rows = await db
    .select({ event: events, taskName: tasks.name })
    .from(events)
    .leftJoin(tasks, eq(events.taskId, tasks.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.id))
    .limit(options.limit);
  return rows.map((row) => buildEventDto(row.event, row.taskName));
}
