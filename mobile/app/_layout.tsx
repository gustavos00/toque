import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { syncReminderNotifications } from "../src/notifications";

export default function RootLayout() {
  // Reschedule the local reminders on start and whenever the app comes back.
  useEffect(() => {
    void syncReminderNotifications();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncReminderNotifications();
    });
    return () => subscription.remove();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="tarefa/[id]" options={{ title: "Tarefa" }} />
      <Stack.Screen
        name="t/[token]"
        options={{ presentation: "transparentModal", headerShown: false }}
      />
      <Stack.Screen name="tag/[id]/associar" options={{ title: "Associar tag" }} />
    </Stack>
  );
}
