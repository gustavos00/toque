import { getTimerPhase } from "@/shared/schedule";
import type { TimerConfig } from "@/shared/tasks";
import { getLocalTime } from "@/shared/time";
import { buildNotificationKey } from "../keys";
import { addMinutes } from "../time";
import type { KindHandler, PlannedNotification, TaskOf, TaskOutcome } from "./types";

type TimerTask = TaskOf<"timer">;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * "Quase a acabar" heads-up `almostDoneMinutes` before the end. Skipped when that moment is
 * not after the start (it would already be in the past at scan time).
 */
function getAlmostDoneAt(config: TimerConfig, startedAt: Date, endsAt: Date): Date | null {
  if (!config.almostDoneEnabled) return null;
  const at = addMinutes(endsAt, -config.almostDoneMinutes);
  return at.getTime() > startedAt.getTime() ? at : null;
}

function buildInfoOutcome(task: TimerTask, message: string): TaskOutcome {
  return { patch: {}, events: [], result: { title: task.name, message, tone: "info" } };
}

/**
 * timer — fire-and-forget. A "start" scan starts a countdown ("quase a acabar" heads-up, then
 * "pronto"); scanning while it runs changes nothing; after the end it starts a new cycle,
 * whose new dedupe keys supersede the old cycle's rows. A "complete" scan / "Já tratei" handles
 * the ended cycle by setting lastDoneAt (shared getTimerPhase: lastDoneAt >= timerEndsAt
 * = handled). "Esqueceste-te?" reminders (on by default)
 * follow the end until then.
 */
export const timerHandler: KindHandler<"timer"> = {
  planNotifications(task, state, { now }) {
    const { timerStartedAt: startedAt, timerEndsAt: endsAt } = state;
    // A handled cycle needs nothing more (its pending reminders get cancelled).
    if (!startedAt || !endsAt || getTimerPhase(state, now) === "handled") return [];
    const occurrence = String(startedAt.getTime());
    const readyAt = getLocalTime(endsAt);
    const rows: PlannedNotification[] = [];

    const almostDoneAt = getAlmostDoneAt(task.config, startedAt, endsAt);
    if (almostDoneAt) {
      rows.push({
        key: buildNotificationKey("timer", task.id, occurrence, "almost"),
        kind: "timer_almost_done",
        dueAt: almostDoneAt,
        // Quiet hours drop it rather than defer it past the end.
        expiresAt: endsAt,
        payload: {
          title: `${task.name} quase a acabar`,
          message: `Faltam ${formatDuration(task.config.almostDoneMinutes)} (acaba às ${readyAt}).`,
          priority: 3,
          tags: ["hourglass_flowing_sand"],
          actions: ["open"],
        },
      });
    }

    rows.push({
      key: buildNotificationKey("timer", task.id, occurrence, "finished"),
      kind: "timer_finished",
      dueAt: endsAt,
      expiresAt: null,
      payload: {
        title: `${task.name}: pronto`,
        message: `Terminou às ${readyAt}.`,
        priority: 4,
        tags: ["white_check_mark"],
        actions: ["open"],
      },
    });

    if (!task.config.forgottenRemindersEnabled) return rows;
    const offsets = task.config.forgottenReminderMinutes;
    offsets.forEach((offset, index) => {
      rows.push({
        key: buildNotificationKey("timer", task.id, occurrence, "forgotten", offset),
        kind: "timer_forgotten",
        dueAt: addMinutes(endsAt, offset),
        expiresAt: null,
        payload: {
          title: `${task.name}: esqueceste-te?`,
          message: `Está pronto desde as ${readyAt} (há ${formatDuration(offset)}).`,
          priority: index === offsets.length - 1 ? 5 : 4,
          tags: ["warning"],
          actions: ["done", "open"],
        },
      });
    });
    return rows;
  },

  /** A timer cycle is identified by its start instant. */
  getCurrentOccurrence(_task, state) {
    return state.timerStartedAt ? String(state.timerStartedAt.getTime()) : null;
  },

  handleScan(task, state, now) {
    if (getTimerPhase(state, now) === "running" && state.timerEndsAt) {
      return buildInfoOutcome(task, `Já está a decorrer · acaba às ${getLocalTime(state.timerEndsAt)}`);
    }
    const endsAt = addMinutes(now, task.config.durationMinutes);
    return {
      patch: { timerStartedAt: now, timerEndsAt: endsAt, snoozedUntil: null },
      events: [{ type: "timer_started", data: { endsAt: endsAt.toISOString() } }],
      result: {
        title: task.name,
        message: `A contar ${formatDuration(task.config.durationMinutes)} · acaba às ${getLocalTime(endsAt)}`,
        tone: "started",
      },
    };
  },

  handleDone(task, state, now) {
    const status = getTimerPhase(state, now);
    const endsAt = state.timerEndsAt;
    if (status === "running" && endsAt) {
      return buildInfoOutcome(task, `Ainda está a decorrer · acaba às ${getLocalTime(endsAt)}`);
    }
    if (status !== "ready" || !endsAt) return buildInfoOutcome(task, "Nada por tratar.");
    return {
      // The cycle stays in task_state so the dashboard shows "acabou às" and "tratada às".
      patch: { lastDoneAt: now, snoozedUntil: null },
      events: [{ type: "done", data: { endsAt: endsAt.toISOString() } }],
      result: { title: task.name, message: `Tratado ✓ (estava pronto desde as ${getLocalTime(endsAt)})`, tone: "done" },
    };
  },
};
