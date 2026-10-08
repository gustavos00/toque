"use client";

import Link from "next/link";
import { CalendarCheck, CircleCheck, Plus, Sparkles } from "lucide-react";
import { getLocalDate, type DashboardDto } from "@/shared";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/hooks/use-now";
import { formatLongToday } from "@/lib/format";
import { getRecurringSummary, getUntilAckSummary, TONE_TEXT } from "@/lib/remaining";
import { useDashboard } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { EventRow } from "./event-row";
import { ListRow, ListSection } from "./grouped-list";
import { PageHeader } from "./page-header";
import { ListSkeleton, LoadError } from "./status";
import { TaskIcon } from "./task-icon";
import { getLiveTimerPhase, TimerCard } from "./timer-card";

export function DashboardView() {
  const { data, error, isLoading, mutate } = useDashboard();
  const now = useNow(1000);

  return (
    <>
      <PageHeader title="Painel" eyebrow={now ? formatLongToday(now) : " "} />
      {isLoading && !data && <ListSkeleton />}
      {error && !data && <LoadError error={error} onRetry={() => mutate()} />}
      {data && <DashboardContent data={data} now={now} />}
    </>
  );
}

function DashboardContent({ data, now }: { data: DashboardDto; now: Date | null }) {
  const reference = now ?? new Date(data.now);
  const hasAnything = data.timers.length + data.untilAckToday.length + data.recurring.length > 0;
  // Running and ready timers always show; handled ones only on the day they were handled.
  const visibleTimers = data.timers.filter((timer) => {
    const status = getLiveTimerPhase(timer, now);
    if (status === "running" || status === "ready") return true;
    return status === "handled" && timer.handledAt !== null && getLocalDate(new Date(timer.handledAt)) === data.today;
  });
  const runningCount = data.timers.filter((timer) => getLiveTimerPhase(timer, now) === "running").length;
  const pendingCount = data.untilAckToday.filter((item) => !item.acked).length;
  const overdueCount = data.recurring.filter((item) => item.overdue).length;

  if (!hasAnything && data.recentEvents.length === 0) {
    return (
      <div className="rounded-2xl bg-card">
        <EmptyState
          icon={Sparkles}
          title="Bem-vindo ao Toque"
          description="Cria uma tarefa, associa-lhe uma tag NFC e toca com o iPhone para registar."
          action={
            <Button asChild size="xl" className="rounded-full">
              <Link href="/tarefas/nova">
                <Plus /> Criar tarefa
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <SummaryPills pending={pendingCount} overdue={overdueCount} running={runningCount} />

      {visibleTimers.length > 0 && (
        <section className="mb-7">
          <h2 className="px-4 pb-1.5 text-[13px] tracking-wide text-muted-foreground uppercase">Agora</h2>
          {visibleTimers.map((timer) => (
            <TimerCard key={timer.task.id} timer={timer} now={now} />
          ))}
        </section>
      )}

      <ListSection title="Hoje">
        {data.untilAckToday.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nada marcado para hoje" description="Dia livre de avisos." />
        ) : (
          data.untilAckToday.map(({ task, acked }) => {
            if (task.kind !== "until_ack") return null;
            const summary = getUntilAckSummary(
              task.config,
              { lastAckDate: acked ? data.today : (task.state?.lastAckDate ?? null), snoozedUntil: task.state?.snoozedUntil ?? null },
              reference,
            );
            return (
              <ListRow
                key={task.id}
                href={`/tarefas/${task.id}`}
                icon={<TaskIcon kind="until_ack" muted={acked} />}
                title={task.name}
                subtitle={
                  acked ? (
                    "Feito hoje"
                  ) : (
                    <>
                      <span className="font-semibold text-warning">{summary.headline}</span>
                      {summary.detail && <> · {summary.detail}</>}
                    </>
                  )
                }
                trailing={
                  acked ? <CircleCheck className="size-6 fill-success text-white" aria-label="Feito" /> : undefined
                }
                chevron={false}
              />
            );
          })
        )}
      </ListSection>

      {data.recurring.length > 0 && (
        <ListSection title="Periódicas">
          {data.recurring.map(({ task, lastDoneAt }) => {
            if (task.kind !== "recurring") return null;
            const summary = getRecurringSummary(task.config, lastDoneAt, task.createdAt, reference);
            return (
              <ListRow
                key={task.id}
                href={`/tarefas/${task.id}`}
                icon={<TaskIcon kind="recurring" />}
                title={task.name}
                subtitle={
                  <>
                    <span className={cn("font-semibold", TONE_TEXT[summary.tone])}>{summary.headline}</span>
                    {summary.detail && <> · {summary.detail}</>}
                  </>
                }
                chevron={false}
              />
            );
          })}
        </ListSection>
      )}

      <ListSection
        title="Recente"
        action={
          <Link href="/historico" className="-my-2 py-2 text-[15px] text-primary active:opacity-60">
            Ver tudo
          </Link>
        }
      >
        {data.recentEvents.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-muted-foreground">Ainda não há registos.</p>
        ) : (
          data.recentEvents.slice(0, 5).map((event) => <EventRow key={event.id} event={event} showDay />)
        )}
      </ListSection>
    </>
  );
}

/** At-a-glance counters under the title. */
function SummaryPills({ pending, overdue, running }: { pending: number; overdue: number; running: number }) {
  const isAllClear = pending === 0 && overdue === 0;
  return (
    <div className="mb-6 grid grid-cols-3 gap-2.5">
      <SummaryPill value={running} label={running === 1 ? "a decorrer" : "a decorrer"} className="text-kind-timer" />
      <SummaryPill value={pending} label="por fazer hoje" className={pending > 0 ? "text-warning" : "text-success"} />
      <SummaryPill
        value={overdue}
        label={overdue === 1 ? "em atraso" : "em atraso"}
        className={overdue > 0 ? "text-destructive" : "text-success"}
      />
      <span className="sr-only">{isAllClear ? "Está tudo em dia." : ""}</span>
    </div>
  );
}

function SummaryPill({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="rounded-2xl bg-card px-3.5 py-3">
      <p className={cn("text-[28px] leading-none font-bold tabular", className)}>{value}</p>
      <p className="mt-1.5 text-[13px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
