import type { Notifier, OutgoingNotification } from "./types";

type NtfyOptions = {
  /** e.g. "https://ntfy.sh" (no trailing path). */
  baseUrl: string;
  /** The topic is the only secret on the ntfy side. */
  topic: string;
  /** Optional access token for protected topics / self-hosted servers. */
  token?: string | null;
  fetch?: typeof fetch;
};

/** ntfy JSON publish body: https://docs.ntfy.sh/publish/#publish-as-json */
export function buildNtfyBody(
  topic: string,
  notification: OutgoingNotification,
) {
  return {
    topic,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    tags: notification.tags,
    ...(notification.clickUrl ? { click: notification.clickUrl } : {}),
    ...(notification.buttons.length > 0
      ? {
          actions: notification.buttons.map((button) => ({
            action: "http",
            label: button.label,
            url: button.url,
            method: button.method,
            clear: button.clear,
          })),
        }
      : {}),
  };
}

export function createNtfyNotifier(options: NtfyOptions): Notifier {
  const doFetch = options.fetch ?? fetch;
  const endpoint = options.baseUrl.replace(/\/+$/, "");
  return {
    async send(notification) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      const response = await doFetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(buildNtfyBody(options.topic, notification)),
      });
      if (!response.ok) {
        // Never echo the topic: it is a secret.
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        throw new Error(
          `ntfy respondeu ${response.status}${detail ? `: ${detail}` : ""}`,
        );
      }
    },
  };
}
