"use client";

import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { TASK_KINDS, type TaskDto } from "@/shared";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/hooks/use-now";
import { useTasks } from "@/lib/queries";
import { getTaskRemaining, TONE_TEXT } from "@/lib/remaining";
import { cn } from "@/lib/utils";
import { describeTaskSchedule, TASK_KIND_META } from "@/lib/task-kinds";
import { EmptyState } from "./empty-state";
import { ListRow, ListSection } from "./grouped-list";
import { PageHeader } from "./page-header";
import { TagChips } from "./tag-chips";
import { ListSkeleton, LoadError } from "./status";
import { TaskIcon } from "./task-icon";

function AddTaskButton() {
  return (
    <Button asChild variant="ghost" size="icon-touch" className="text-primary">
      <Link href="/tarefas/nova" aria-label="Nova tarefa">
        <Plus className="size-7" />
      </Link>
    </Button>
  );
}

/** Right-hand "time left" glance: "faltam 42 min", "aviso às 13:00", "Faltam 2 dias"… */
function RemainingLabel({ task, now }: { task: TaskDto; now: Date }) {
  const summary = getTaskRemaining(task, now);
  return (
    <span className={cn("max-w-36 text-right text-[15px] leading-tight font-medium", TONE_TEXT[summary.tone])}>
      {summary.short}
    </span>
  );
}

export function TaskListView() {
  const { data: tasks, error, isLoading, mutate } = useTasks();
  const now = useNow(15_000);

  return (
    <>
      {/* "+" only once there is a list; while loading or empty, the empty state's button is the way in. */}
      <PageHeader title="Tarefas" action={tasks && tasks.length > 0 ? <AddTaskButton /> : undefined} />
      {isLoading && !tasks && <ListSkeleton />}
      {error && !tasks && <LoadError error={error} onRetry={() => mutate()} />}
      {tasks && tasks.length === 0 && (
        <div className="rounded-2xl bg-card">
          <EmptyState
            icon={ListChecks}
            title="Sem tarefas"
            description="Uma tarefa é o que acontece quando tocas numa tag: a máquina, o lixo, as plantas…"
            action={
              <Button asChild size="xl" className="rounded-full">
                <Link href="/tarefas/nova">
                  <Plus /> Criar tarefa
                </Link>
              </Button>
            }
          />
        </div>
      )}
      {tasks &&
        TASK_KINDS.map((kind) => {
          const ofKind = tasks
            .filter((task) => task.kind === kind)
            .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, "pt"));
          if (ofKind.length === 0) return null;
          return (
            <ListSection key={kind} title={TASK_KIND_META[kind].label}>
              {ofKind.map((task) => {
                const taskTags = task.tags;
                return (
                  <ListRow
                    key={task.id}
                    href={`/tarefas/${task.id}`}
                    icon={<TaskIcon kind={task.kind} muted={!task.enabled} />}
                    title={<span className={task.enabled ? undefined : "text-muted-foreground"}>{task.name}</span>}
                    subtitle={
                      <>
                        <span className="block">{task.enabled ? describeTaskSchedule(task) : "Desativada"}</span>
                        {taskTags && (
                          <span className="mt-1 block">
                            <TagChips tags={taskTags} />
                          </span>
                        )}
                      </>
                    }
                    trailing={now && task.enabled ? <RemainingLabel task={task} now={now} /> : undefined}
                  />
                );
              })}
            </ListSection>
          );
        })}
    </>
  );
}
