import type { TaskKind } from "@/shared";
import { TASK_KIND_META } from "@/lib/task-kinds";
import { cn } from "@/lib/utils";

/** Rounded-square coloured tile with the kind's glyph (like iOS Settings icons). */
export function TaskIcon({ kind, size = "md", muted = false }: { kind: TaskKind; size?: "md" | "lg"; muted?: boolean }) {
  const { icon: Icon, tileClassName } = TASK_KIND_META[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center text-white",
        size === "md" ? "size-[30px] rounded-[8px]" : "size-11 rounded-[12px]",
        muted ? "bg-muted-foreground/40" : tileClassName,
      )}
    >
      <Icon className={size === "md" ? "size-[18px]" : "size-6"} strokeWidth={2.2} />
    </span>
  );
}
