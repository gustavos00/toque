// GET    /api/tasks/:id → TaskDto
// PATCH  /api/tasks/:id  body UpdateTaskRequest → TaskDto
// DELETE /api/tasks/:id → 204 (tags become unassigned; state and pending
//        notifications are deleted; history keeps the events)

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { buildTask, buildTaskDto, getTaskById } from "@/server/db/queries";
import { events, tasks, taskState } from "@/server/db/schema";
import { rescheduleTask } from "@/server/engine";
import { updateTaskRequestSchema } from "@/shared/api";
import { taskDefinitionSchema } from "@/shared/tasks";
import {
  createNotFoundResponse,
  isUuid,
  parseJsonBody,
  parseValue,
} from "../../_lib/http";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Tarefa");
  const db = await getDb();
  const task = await getTaskById(db, id);
  if (!task) return createNotFoundResponse("Tarefa");
  const [state] = await db
    .select()
    .from(taskState)
    .where(eq(taskState.taskId, id));
  return Response.json(buildTaskDto(task, state));
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Tarefa");
  const parsed = await parseJsonBody(request, updateTaskRequestSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getDb();
  const existing = await getTaskById(db, id);
  if (!existing) return createNotFoundResponse("Tarefa");

  const { name, enabled, kind, config } = parsed.data;
  const kindChanged = kind !== undefined && kind !== existing.kind;
  const definition = parseValue(
    {
      kind: kind ?? existing.kind,
      // Changing kind without a config → let validation report what is missing.
      config: config ?? (kindChanged ? {} : existing.config),
    },
    taskDefinitionSchema,
  );
  if (!definition.ok) return definition.response;

  const [row] = await db
    .update(tasks)
    .set({
      name: name ?? existing.name,
      enabled: enabled ?? existing.enabled,
      kind: definition.data.kind,
      config: definition.data.config,
    })
    .where(eq(tasks.id, id))
    .returning();
  // A different kind means the old runtime state no longer applies.
  if (kindChanged) await db.delete(taskState).where(eq(taskState.taskId, id));
  await db.insert(events).values({
    type: "task_updated",
    taskId: id,
    data: { fields: Object.keys(parsed.data) },
  });
  await rescheduleTask(id, new Date());

  const [state] = await db
    .select()
    .from(taskState)
    .where(eq(taskState.taskId, id));
  return Response.json(buildTaskDto(buildTask(row), state));
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">,
) {
  const denied = await requireSession(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isUuid(id)) return createNotFoundResponse("Tarefa");
  const db = await getDb();
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!deleted) return createNotFoundResponse("Tarefa");
  await db
    .insert(events)
    .values({ type: "task_deleted", data: { taskId: id, name: deleted.name } });
  await rescheduleTask(id, new Date());
  return new Response(null, { status: 204 });
}
