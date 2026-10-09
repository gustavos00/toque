import type { TagAction, TaskTagDto } from "@/shared";

/** The tags linked to a task (TaskDto.tags), as chips or rows. */
export type TaskTagRef = TaskTagDto;

/** Short badge text for a tag's action. */
export function formatTagAction(action: TagAction) {
  return action === "complete" ? "tratada" : "inicia";
}
