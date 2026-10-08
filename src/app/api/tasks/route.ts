// GET  /api/tasks → TaskDto[] (with engine state), by name
// POST /api/tasks  body CreateTaskRequest → 201 TaskDto

import { asc } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { buildTask, buildTaskDto } from "@/server/db/queries";
import { events, tasks, taskState } from "@/server/db/schema";
import { rescheduleTask } from "@/server/engine";
import { createTaskRequestSchema, type TaskDto } from "@/shared/api";
import { parseJsonBody } from "../_lib/http";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const db = await getDb();
  const [taskRows, stateRows] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.name)),
    db.select().from(taskState),
  ]);
  const stateByTask = new Map(stateRows.map((row) => [row.taskId, row]));
  const body: TaskDto[] = taskRows.map((row) =>
    buildTaskDto(buildTask(row), stateByTask.get(row.id)),
  );
  return Response.json(body);
}

export async function POST(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const parsed = await parseJsonBody(request, createTaskRequestSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getDb();
  const { name, enabled, kind, config } = parsed.data;
  const [row] = await db
    .insert(tasks)
    .values({ name, enabled, kind, config })
    .returning();
  await db
    .insert(events)
    .values({ type: "task_created", taskId: row.id, data: { name } });
  await rescheduleTask(row.id, new Date());
  return Response.json(buildTaskDto(buildTask(row), null), { status: 201 });
}
