"use client";

import Link from "next/link";
import { ListChecks, Nfc, Plus } from "lucide-react";
import { useState } from "react";
import type { TagDto } from "@/shared";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { useTags, useTasks } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ListRow, ListSection } from "./grouped-list";
import { PageHeader } from "./page-header";
import { formatTagAction } from "@/lib/task-tags";
import { ListSkeleton, LoadError } from "./status";
import { TagSheet } from "./tag-sheet";

export function TagListView() {
  const { data: tags, error, isLoading, mutate } = useTags();
  const { data: tasks } = useTasks();
  const [editing, setEditing] = useState<TagDto | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  /** null = new tag (the sheet shows the task picker). */
  function openSheet(tag: TagDto | null) {
    setEditing(tag);
    setIsSheetOpen(true);
  }

  return (
    <>
      {/* "+" only once there is a list; when empty, the empty state points to Tarefas. */}
      <PageHeader
        title="Tags"
        action={
          tags && tags.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-touch"
              className="text-primary"
              aria-label="Nova tag"
              onClick={() => openSheet(null)}
            >
              <Plus className="size-7" />
            </Button>
          ) : undefined
        }
      />
      {isLoading && !tags && <ListSkeleton sections={1} rows={4} />}
      {error && !tags && <LoadError error={error} onRetry={() => mutate()} />}
      {tags && tags.length === 0 && (
        <div className="rounded-2xl bg-card">
          <EmptyState
            icon={Nfc}
            title="Sem tags"
            description="Cria tags a partir de cada tarefa, em Tarefas → tarefa → Adicionar tag."
            action={
              <Button asChild size="xl" className="rounded-full">
                <Link href="/tarefas">
                  <ListChecks /> Ir para Tarefas
                </Link>
              </Button>
            }
          />
        </div>
      )}
      {tags && tags.length > 0 && (
        <ListSection footer="Toca numa tag para ver o URL a gravar com a app NFC Tools.">
          {tags.map((tag) => {
            const task = tasks?.find((candidate) => candidate.id === tag.taskId);
            return (
              <ListRow
                key={tag.id}
                onClick={() => openSheet(tag)}
                chevron
                icon={
                  <span
                    className={cn(
                      "flex size-[30px] items-center justify-center rounded-[8px] text-white",
                      task ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  >
                    <Nfc className="size-[18px]" />
                  </span>
                }
                title={tag.label}
                subtitle={
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {task ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[13px] font-medium text-accent-foreground">
                        {task.name} · {formatTagAction(tag.action)}
                      </span>
                    ) : (
                      <span className="text-warning">Sem tarefa</span>
                    )}
                    <span>{tag.lastScannedAt ? `lida ${formatRelative(tag.lastScannedAt)}` : "nunca lida"}</span>
                  </span>
                }
              />
            );
          })}
        </ListSection>
      )}
      <TagSheet tag={editing} tasks={tasks ?? []} open={isSheetOpen} onOpenChange={setIsSheetOpen} />
    </>
  );
}
