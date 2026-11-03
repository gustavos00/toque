import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { colors } from "../src/components/ui";
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
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600", fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task" }} />
        <Stack.Screen
          name="t/[token]"
          options={{
            presentation: "transparentModal",
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen name="tag/[id]/link" options={{ title: "NFC tag" }} />
      </Stack>
    </>
  );
}
