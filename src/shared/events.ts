// History log entries (table `events`). `type` is text in the DB; this list is
// the contract. Add new types here freely — no migration needed.

import { z } from "zod";

export const EVENT_TYPES = [
  // Written by the API / scan route:
  "scan", // a tag was scanned (data: { userAgent? })
  "task_created",
  "task_updated",
  "task_deleted", // task_id is null afterwards; data: { name }
  // Written by the engine:
  "timer_started", // data: { endsAt }
  "timer_finished",
  "timer_cancelled",
  "acked", // until_ack acknowledged for a local day (data: { date })
  "done", // recurring / timer confirmed done
  "snoozed", // data: { until }
  "notification_sent", // data: { notificationId, kind }
  "notification_failed", // data: { notificationId, error }
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;
