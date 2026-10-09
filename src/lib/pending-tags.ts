// Pure rules for the tags chosen while creating a task ("pending" until the
// task exists). Used by PendingTagsSection and the new-task form.

import type { CreateTagRequest, TagAction, TaskKind, UpdateTagRequest } from "@/shared";

/** A tag to create (or an existing free tag to assign) once the task is saved. */
export type PendingTag =
  | { key: string; source: "new"; label: string; isLabelEdited: boolean; action: TagAction }
  | { key: string; source: "existing"; tagId: string; label: string; action: TagAction };

let pendingKeyCounter = 0;
export function createPendingKey() {
  pendingKeyCounter += 1;
  return `pending-${pendingKeyCounter}`;
}

/** Only timers distinguish start / complete; every other kind saves "start". */
export function getPendingTagAction(kind: TaskKind, action: TagAction): TagAction {
  return kind === "timer" ? action : "start";
}

/** Default tag name: "Máquina" / "Estendal" (timer), "Porta" (até confirmar), the task name (periódica). */
export function getDefaultTagLabel(kind: TaskKind, action: TagAction, taskName: string) {
  if (kind === "timer") return action === "complete" ? "Estendal" : "Máquina";
  if (kind === "until_ack") return "Porta";
  return taskName.trim() || "Tag";
}

/** "Porta", then "Porta 2", "Porta 3"… so default names never repeat. */
export function createUniqueLabel(base: string, takenLabels: readonly string[]) {
  if (!takenLabels.includes(base)) return base;
  let suffix = 2;
  while (takenLabels.includes(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function createPendingTag(
  kind: TaskKind,
  action: TagAction,
  taskName: string,
  others: readonly PendingTag[] = [],
): PendingTag {
  const normalizedAction = getPendingTagAction(kind, action);
  return {
    key: createPendingKey(),
    source: "new",
    label: createUniqueLabel(
      getDefaultTagLabel(kind, normalizedAction, taskName),
      others.map((tag) => tag.label),
    ),
    isLabelEdited: false,
    action: normalizedAction,
  };
}

/** A new task starts with one default tag ("Máquina · Inicia" for timers). */
export function createDefaultPendingTags(kind: TaskKind, taskName: string): PendingTag[] {
  return [createPendingTag(kind, "start", taskName)];
}

/**
 * After the kind or task name changes: normalises every tag's action for the
 * kind (existing ones too, so the screen matches what is saved) and renames
 * untouched default names, keeping them unique.
 */
export function refreshPendingLabels(tags: readonly PendingTag[], kind: TaskKind, taskName: string): PendingTag[] {
  const result: PendingTag[] = [];
  for (const tag of tags) {
    const action = getPendingTagAction(kind, tag.action);
    if (tag.source === "existing" || tag.isLabelEdited) {
      result.push({ ...tag, action });
      continue;
    }
    // Names fixed by hand (or existing tags) later in the list also count as taken.
    const taken = [
      ...result.map((other) => other.label),
      ...tags.filter((other) => other.source === "existing" || other.isLabelEdited).map((other) => other.label),
    ];
    result.push({ ...tag, action, label: createUniqueLabel(getDefaultTagLabel(kind, action, taskName), taken) });
  }
  return result;
}

type PendingTagRequest =
  | { type: "create"; input: CreateTagRequest }
  | { type: "assign"; tagId: string; input: UpdateTagRequest };

/** What to send for one pending tag once the task exists. */
export function buildPendingTagRequest(
  tag: PendingTag,
  task: { id: string; kind: TaskKind; name: string },
): PendingTagRequest {
  const action = getPendingTagAction(task.kind, tag.action);
  if (tag.source === "existing") return { type: "assign", tagId: tag.tagId, input: { taskId: task.id, action } };
  const label = tag.label.trim() || getDefaultTagLabel(task.kind, action, task.name);
  return { type: "create", input: { label, taskId: task.id, action } };
}
