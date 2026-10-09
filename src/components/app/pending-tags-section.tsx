"use client";

import { CircleMinus, CirclePlus } from "lucide-react";
import type { TagAction, TagDto, TaskKind } from "@/shared";
import {
  createPendingKey,
  createPendingTag,
  createUniqueLabel,
  getDefaultTagLabel,
  getPendingTagAction,
  type PendingTag,
} from "@/lib/pending-tags";
import { formatTagAction } from "@/lib/task-tags";
import { ListSection } from "./grouped-list";
import { SegmentedControl } from "./segmented-control";

const ACTION_OPTIONS = [
  { value: "start", label: "Inicia" },
  { value: "complete", label: "Marca como tratada" },
] as const satisfies readonly { value: TagAction; label: string }[];

type PendingTagsSectionProps = {
  kind: TaskKind;
  taskName: string;
  value: PendingTag[];
  onChange: (tags: PendingTag[]) => void;
  /** Existing tags with no task, offered for assignment. */
  freeTags: TagDto[];
};

/** "Tags" section of the new-task form: pending tags, created right after the task. */
export function PendingTagsSection({ kind, taskName, value, onChange, freeTags }: PendingTagsSectionProps) {
  const isTimer = kind === "timer";
  const hasCompleteTag = value.some((tag) => tag.action === "complete");
  const assignableTags = freeTags.filter((free) => !value.some((tag) => tag.source === "existing" && tag.tagId === free.id));

  function updateTag(key: string, patch: Partial<{ label: string; action: TagAction }>) {
    onChange(
      value.map((tag) => {
        if (tag.key !== key) return tag;
        if (tag.source === "new") {
          const action = patch.action ?? tag.action;
          const takenLabels = value.filter((other) => other.key !== key).map((other) => other.label);
          const label =
            patch.label ??
            (tag.isLabelEdited ? tag.label : createUniqueLabel(getDefaultTagLabel(kind, action, taskName), takenLabels));
          return { ...tag, action, label, isLabelEdited: tag.isLabelEdited || patch.label !== undefined };
        }
        return { ...tag, ...patch };
      }),
    );
  }

  function assignExisting(tagId: string) {
    const free = freeTags.find((tag) => tag.id === tagId);
    if (!free) return;
    onChange([
      ...value,
      { key: createPendingKey(), source: "existing", tagId: free.id, label: free.label, action: getPendingTagAction(kind, free.action) },
    ]);
  }

  return (
    <ListSection
      title="Tags"
      footer={
        value.length === 0 ? (
          <span className="text-warning">Sem tag não dá para registar com um toque.</span>
        ) : (
          "São criadas com a tarefa. Depois, grava o URL de cada uma numa tag NFC."
        )
      }
    >
      {value.map((tag) => (
        <div key={tag.key} className="border-b border-separator">
          <div className="flex items-center pl-2">
            <button
              type="button"
              aria-label={`Remover tag ${tag.label}`}
              onClick={() => onChange(value.filter((other) => other.key !== tag.key))}
              className="flex size-11 shrink-0 items-center justify-center"
            >
              <CircleMinus className="size-[22px] fill-destructive text-white dark:text-card" />
            </button>
            {tag.source === "new" ? (
              <input
                aria-label="Nome da tag"
                value={tag.label}
                maxLength={80}
                onChange={(event) => updateTag(tag.key, { label: event.target.value })}
                className="h-11 min-w-0 flex-1 bg-transparent pr-4 text-[17px] outline-none"
              />
            ) : (
              <p className="min-w-0 flex-1 truncate pr-4 text-[17px]">
                {tag.label} <span className="text-[14px] text-muted-foreground">· tag existente</span>
              </p>
            )}
            {!isTimer && <span className="pr-4 text-[14px] text-muted-foreground">{formatTagAction(tag.action)}</span>}
          </div>
          {isTimer && (
            <div className="px-3 pb-2.5">
              <SegmentedControl
                label={`O que faz a tag ${tag.label}`}
                value={tag.action}
                options={ACTION_OPTIONS}
                onChange={(action) => updateTag(tag.key, { action })}
              />
            </div>
          )}
        </div>
      ))}
      <AddRow label="Adicionar tag" onClick={() => onChange([...value, createPendingTag(kind, "start", taskName, value)])} />
      {isTimer && !hasCompleteTag && (
        <AddRow
          label="Tag para marcar como tratada"
          onClick={() => onChange([...value, createPendingTag(kind, "complete", taskName, value)])}
        />
      )}
      {assignableTags.length > 0 && (
        <div className="flex items-center gap-3 border-t border-separator py-1 pr-4 pl-4">
          <label htmlFor="assign-existing-tag" className="shrink-0 text-[17px]">
            Usar tag existente
          </label>
          <select
            id="assign-existing-tag"
            value=""
            onChange={(event) => assignExisting(event.target.value)}
            className="h-11 min-w-0 flex-1 appearance-none truncate bg-transparent text-right text-[17px] text-primary outline-none"
          >
            <option value="">Escolher…</option>
            {assignableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </ListSection>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pressable flex w-full items-center pl-2 text-left text-primary">
      <span className="flex size-11 shrink-0 items-center justify-center">
        <CirclePlus className="size-[22px] fill-success text-white dark:text-card" />
      </span>
      <span className="min-h-11 flex-1 content-center text-[17px]">{label}</span>
    </button>
  );
}
