/** A button on the notification that makes an HTTP request (ntfy "http" action). */
export type NotificationButton = { label: string; url: string; method: "POST" | "GET"; clear: boolean };

/** Everything a provider needs to show one notification. No secrets in the text fields. */
export type OutgoingNotification = {
  title: string;
  message: string;
  /** 1 (min) … 5 (urgent). */
  priority: number;
  tags: string[];
  /** Opened when the notification itself is tapped. */
  clickUrl: string | null;
  buttons: NotificationButton[];
};

/** Delivery provider (ntfy now, Pushover later). Throws on failure so the tick can retry. */
export interface Notifier {
  send(notification: OutgoingNotification): Promise<void>;
}
