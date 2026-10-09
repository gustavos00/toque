import type { EventType } from "@/shared/events";
import type {
  NotificationKind,
  NotificationPayload,
} from "@/shared/notifications";
import type { ScanResult } from "@/shared/scan";
import type { Settings } from "@/shared/settings";
import type { Task, TaskKind } from "@/shared/tasks";
import type { LocalDate } from "@/shared/time";

/** Engine runtime state of a task (mirrors the `task_state` table). */
export type EngineTaskState = {
  timerStartedAt: Date | null;
  timerEndsAt: Date | null;
  lastDoneAt: Date | null;
  lastAckDate: LocalDate | null;
  snoozedUntil: Date | null;
};

export const EMPTY_TASK_STATE: EngineTaskState = {
  timerStartedAt: null,
  timerEndsAt: null,
  lastDoneAt: null,
  lastAckDate: null,
  snoozedUntil: null,
};

/** One row the outbox should contain. `key` becomes the unique `dedupe_key`. */
export type PlannedNotification = {
  key: string;
  kind: NotificationKind;
  dueAt: Date;
  /** Don't deliver at/after this instant (quiet hours drop it instead of deferring past it). */
  expiresAt: Date | null;
  payload: NotificationPayload;
};

/** What a scan / "feito" changes: a state patch, history events and the text shown to the user. */
export type TaskOutcome = {
  patch: Partial<EngineTaskState>;
  events: { type: EventType; data?: Record<string, unknown> }[];
  result: ScanResult;
};

export type PlanContext = { now: Date; settings: Settings };

/** A task narrowed to one kind. */
export type TaskOf<K extends TaskKind> = Extract<Task, { kind: K }>;

/**
 * Strategy for one task kind. Adding a kind = writing one of these and
 * registering it in `registry.ts`; the outbox, tick, quiet hours and snooze are generic.
 */
export type KindHandler<K extends TaskKind> = {
  /**
   * Every notification that should exist for the task right now: still-relevant past
   * ones (so they are not cancelled, and so a late tick can catch up) plus upcoming ones.
   */
  planNotifications(
    task: TaskOf<K>,
    state: EngineTaskState,
    ctx: PlanContext,
  ): PlannedNotification[];
  /**
   * The occurrence notification buttons must match to act (same value as the third segment of
   * the row keys, see keys.ts); null = nothing can be acted on.
   */
  getCurrentOccurrence(
    task: TaskOf<K>,
    state: EngineTaskState,
    now: Date,
  ): string | null;
  /** NFC tag scanned (a "start" tag). */
  handleScan(task: TaskOf<K>, state: EngineTaskState, now: Date): TaskOutcome;
  /** A "complete" tag scanned, or "Feito"/"Já tratei" tapped on a notification. */
  handleDone(task: TaskOf<K>, state: EngineTaskState, now: Date): TaskOutcome;
};
