import type { Task, TaskKind } from "@/shared/tasks";
import { recurringHandler } from "./recurring";
import { timerHandler } from "./timer";
import type { KindHandler } from "./types";
import { untilAckHandler } from "./until-ack";

/** One handler per kind. The mapped type makes a new kind in TASK_KINDS a compile error until it is registered. */
const HANDLERS: { [K in TaskKind]: KindHandler<K> } = {
  timer: timerHandler,
  until_ack: untilAckHandler,
  recurring: recurringHandler,
};

/** The handler for a task's kind, typed loosely so callers don't need to narrow the task. */
export function getKindHandler(task: Task): KindHandler<TaskKind> {
  const handler = HANDLERS[task.kind] as KindHandler<TaskKind> | undefined;
  if (!handler) throw new Error(`Tipo de tarefa sem handler: ${task.kind}`);
  return handler;
}
