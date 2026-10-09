import { Nfc, TriangleAlert } from "lucide-react";
import { formatTagAction, type TaskTagRef } from "@/lib/task-tags";
import { cn } from "@/lib/utils";

/** Small chip: "📶 Máquina · inicia". */
export function TagChip({ tag, className }: { tag: TaskTagRef; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[15rem] min-w-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[13px] leading-5 font-medium text-accent-foreground",
        className,
      )}
    >
      <Nfc aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{tag.label}</span>
      <span className="shrink-0">· {formatTagAction(tag.action)}</span>
    </span>
  );
}

/** Chips for every linked tag, or a warning that the task can't be tapped. */
export function TagChips({ tags }: { tags: TaskTagRef[] }) {
  if (tags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-warning">
        <TriangleAlert aria-hidden className="size-3.5" /> Sem tag
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
    </span>
  );
}
