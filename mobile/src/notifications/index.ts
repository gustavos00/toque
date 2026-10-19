// Local reminder notifications (replace ntfy). Entry point: syncReminderNotifications().
// Call it on app start, when the app returns to the foreground and after editing tasks.
// It asks for permission, fetches GET /api/reminders/upcoming, cancels every pending local
// notification and schedules the nearest ones again (iOS keeps at most 64 pending).
// "Feito"/"Adiar" buttons POST to the signed URLs that came with each reminder.

import * as Notifications from "expo-notifications";
import { getApiUrl, getToken } from "../api";

/** iOS drops everything beyond 64 pending local notifications. */
const MAX_SCHEDULED = 64;
const CATEGORY_ID = "toque-reminder";
const ACTION_DONE = "done";
const ACTION_SNOOZE = "snooze";

// Mirrors UpcomingReminder in src/server/engine/upcoming.ts (type-only server code is not
// pulled into the app bundle).
type UpcomingReminder = {
  id: string;
  taskId: string;
  taskName: string;
  title: string;
  message: string;
  priority: number;
  dueAt: string;
  doneUrl: string | null;
  snoozeUrl: string | null;
};

type ReminderData = {
  doneUrl: string | null;
  snoozeUrl: string | null;
};

let isSetUp = false;
let isSyncing = false;

function setUpNotifications(): void {
  if (isSetUp) return;
  isSetUp = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  void Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: ACTION_DONE,
      buttonTitle: "Feito",
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: "Adiar",
      options: { opensAppToForeground: false },
    },
  ]);
  Notifications.addNotificationResponseReceivedListener((response) => {
    void handleResponse(response);
  });
}

async function handleResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  const data = response.notification.request.content
    .data as Partial<ReminderData>;
  const url =
    response.actionIdentifier === ACTION_DONE
      ? data.doneUrl
      : response.actionIdentifier === ACTION_SNOOZE
        ? data.snoozeUrl
        : null;
  if (!url) return;
  try {
    // The signed URL is the credential: no Authorization header.
    await fetch(url, { method: "POST" });
  } catch {
    // Offline: the reminder stays on the lock screen; nothing else to do.
  }
  // The schedule changed on the server (done/snooze): rebuild the local one.
  await syncReminderNotifications();
}

async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function fetchUpcomingReminders(): Promise<UpcomingReminder[] | null> {
  const token = await getToken();
  if (!token) return null;
  const response = await fetch(
    `${getApiUrl()}/api/reminders/upcoming?limit=${MAX_SCHEDULED}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { reminders: UpcomingReminder[] };
  return body.reminders;
}

/**
 * Replaces the pending local notifications with the server's next reminders.
 * Returns how many were scheduled, or null when nothing was changed (no permission,
 * signed out, offline or server error — the existing schedule is kept in those cases).
 */
export async function syncReminderNotifications(): Promise<number | null> {
  if (isSyncing) return null;
  isSyncing = true;
  try {
    setUpNotifications();
    if (!(await requestPermission())) return null;
    const reminders = await fetchUpcomingReminders().catch(() => null);
    if (!reminders) return null;

    await Notifications.cancelAllScheduledNotificationsAsync();
    const nearest = [...reminders]
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, MAX_SCHEDULED);
    for (const reminder of nearest) {
      const data: ReminderData = {
        doneUrl: reminder.doneUrl,
        snoozeUrl: reminder.snoozeUrl,
      };
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
          title: reminder.title,
          body: reminder.message,
          data: { ...data, taskId: reminder.taskId },
          ...(reminder.doneUrl || reminder.snoozeUrl
            ? { categoryIdentifier: CATEGORY_ID }
            : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.dueAt),
        },
      });
    }
    return nearest.length;
  } finally {
    isSyncing = false;
  }
}
