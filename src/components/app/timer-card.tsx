"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { getTimerPhase, type DashboardDto } from "@/shared";
import { formatCountdown } from "@/lib/format";
import { getTimerSummary } from "@/lib/remaining";
import { cn } from "@/lib/utils";
import { TaskIcon } from "./task-icon";

type DashboardTimer = DashboardDto["timers"][number];

/** Phase recomputed live, so a card flips to "ready" the second it ends. */
export function getLiveTimerPhase(timer: DashboardTimer, now: Date | null) {
  if (!now) return timer.phase;
  return getTimerPhase(
    {
      timerEndsAt: timer.endsAt ? new Date(timer.endsAt) : null,
      lastDoneAt: timer.handledAt ? new Date(timer.handledAt) : null,
    },
    now,
  );
}

/**
 * Timer task card (fire-and-forget: no cancel / confirm controls).
 * - running: "faltam 42 min", "acaba às 15:40", a progress bar with the
 *   heads-up marker, and a small seconds clock
 * - ready: "Pronta · por estender" until a complete-tag scan
 * - handled: "Tratada às HH:MM"
 */
export function TimerCard({ timer, now }: { timer: DashboardTimer; now: Date | null }) {
  const { task } = timer;
  if (task.kind !== "timer") return null;
  const reference = now ?? new Date(timer.startedAt ?? timer.endsAt ?? 0);
  const summary = getTimerSummary(task.config, timer, reference);
  const href = `/tarefas/${task.id}`;

  if (summary.phase === "running" && timer.endsAt) {
    const progress = summary.progress ?? 0;
    return (
      <Link
        href={href}
        className="pressable mb-3 block rounded-2xl bg-card p-4"
        aria-label={`${task.name}: ${summary.headline}, ${summary.detail}`}
      >
        <div className="flex items-center gap-3">
          <TaskIcon kind="timer" />
          <p className="min-w-0 flex-1 truncate text-[17px] font-semibold">{task.name}</p>
          <span className="text-[15px] text-muted-foreground tabular" aria-hidden>
            {now ? formatCountdown(new Date(timer.endsAt).getTime() - now.getTime()) : ""}
          </span>
        </div>
        <p className="mt-3 text-[34px] leading-tight font-bold tracking-tight text-kind-timer first-letter:uppercase" role="timer">
          {now ? summary.headline : " "}
        </p>
        <p className="text-[15px] text-muted-foreground">{summary.detail}</p>
        <div className="relative mt-3.5">
          <div
            className="h-2 overflow-hidden rounded-full bg-fill"
            role="progressbar"
            aria-label="Progresso"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full rounded-full bg-kind-timer transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {summary.almostDoneMark !== null && (
            <span
              aria-hidden
              title="Aviso antes de acabar"
              className={cn(
                "absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                progress >= summary.almostDoneMark ? "bg-warning" : "bg-muted-foreground/70",
              )}
              style={{ left: `${summary.almostDoneMark * 100}%` }}
            />
          )}
        </div>
      </Link>
    );
  }

  const isReady = summary.phase === "ready";
  return (
    <Link
      href={href}
      className={cn("pressable mb-3 flex items-center gap-3 rounded-2xl bg-card p-4", isReady && "ring-2 ring-warning/40 ring-inset")}
    >
      <TaskIcon kind="timer" muted={!isReady} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-semibold">{task.name}</p>
        <p className={cn("text-[15px]", isReady ? "font-semibold text-warning" : "text-muted-foreground")}>{summary.headline}</p>
        {isReady && summary.detail && <p className="text-[13px] text-muted-foreground">{summary.detail}</p>}
      </div>
      {summary.phase === "handled" && <CircleCheck aria-hidden className="size-6 fill-success text-white" />}
    </Link>
  );
}
