// Summary for GET /api/dashboard, derived purely from tasks + task_state.

import { eq } from "drizzle-orm";
import type { DashboardDto } from "@/shared/api";
import {
  getNextRecurringOccurrence,
  getRecurringDueAt,
  getTimerPhase,
  isUntilAckDay,
  type TimerPhase,
} from "@/shared/schedule";
import { getLocalDate } from "@/shared/time";
import { listEvents } from "./history";
import type { Db } from "./index";
import { buildTask, buildTaskDto, getTagsByTaskId } from "./queries";
import { tasks, taskState } from "./schema";

const RECENT_EVENTS_LIMIT = 10;
const TIMER_PHASE_ORDER: Record<TimerPhase, number> = {
  ready: 0,
  running: 1,
  handled: 2,
  idle: 3,
};

export async function buildDashboard(db: Db, now: Date): Promise<DashboardDto> {
  const today = getLocalDate(now);
  const [rows, recentEvents, tagsByTask] = await Promise.all([
    db
      .select({ task: tasks, state: taskState })
      .from(tasks)
      .leftJoin(taskState, eq(taskState.taskId, tasks.id))
      .where(eq(tasks.enabled, true)),
    listEvents(db, { limit: RECENT_EVENTS_LIMIT }),
    getTagsByTaskId(db),
  ]);

  const dashboard: DashboardDto = {
    now: now.toISOString(),
    today,
    timers: [],
    untilAckToday: [],
    recurring: [],
    recentEvents,
  };

  for (const row of rows) {
    const task = buildTask(row.task);
    const state = row.state;
    const dto = buildTaskDto(task, state, tagsByTask.get(task.id) ?? []);
    if (task.kind === "timer") {
      const phase = getTimerPhase(state, now);
      dashboard.timers.push({
        task: dto,
        phase,
        startedAt: state?.timerStartedAt?.toISOString() ?? null,
        endsAt: state?.timerEndsAt?.toISOString() ?? null,
        handledAt:
          phase === "handled"
            ? (state?.lastDoneAt?.toISOString() ?? null)
            : null,
      });
    } else if (task.kind === "until_ack") {
      if (isUntilAckDay(task.config, today)) {
        dashboard.untilAckToday.push({
          task: dto,
          acked: state?.lastAckDate === today,
        });
      }
    } else if (task.kind === "recurring") {
      const lastDoneAt = state?.lastDoneAt ?? null;
      const history = { lastDoneAt, createdAt: task.createdAt };
      const dueAt = getRecurringDueAt(task.config, history, now);
      dashboard.recurring.push({
        task: dto,
        lastDoneAt: lastDoneAt?.toISOString() ?? null,
        dueAt: dueAt.toISOString(),
        overdue: now >= dueAt,
        nextDueAt: getNextRecurringOccurrence(
          task.config,
          history,
          now,
        ).toISOString(),
      });
    }
  }

  dashboard.timers.sort(
    (a, b) =>
      TIMER_PHASE_ORDER[a.phase] - TIMER_PHASE_ORDER[b.phase] ||
      (a.endsAt ?? "").localeCompare(b.endsAt ?? "") ||
      a.task.name.localeCompare(b.task.name, "pt"),
  );
  dashboard.untilAckToday.sort(
    (a, b) =>
      Number(a.acked) - Number(b.acked) ||
      a.task.name.localeCompare(b.task.name, "pt"),
  );
  dashboard.recurring.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return dashboard;
}
