// Scheduled notifications outbox (table `notifications`). The engine inserts
// rows with a `due_at`; /api/tick sends due rows and stamps `sent_at`.

import { z } from "zod";

export const NOTIFICATION_KINDS = [
  "timer_almost_done",
  "timer_finished",
  "timer_forgotten",
  "until_ack_reminder",
  "recurring_due",
  "recurring_overdue",
  "custom",
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

/** What to send. The engine maps it to ntfy headers/actions. */
export const notificationPayloadSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  /** ntfy priority: 1 (min) … 5 (urgent). */
  priority: z.number().int().min(1).max(5).default(3),
  /** ntfy tags / emoji shortcodes. */
  tags: z.array(z.string()).default([]),
  /** Buttons on the notification. */
  actions: z.array(z.enum(["done", "snooze", "open"])).default([]),
});
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
