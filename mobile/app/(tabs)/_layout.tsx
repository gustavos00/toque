import { Tabs } from "expo-router";
import { colors } from "../../src/components/ui";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Words only: five labelled tabs need no icons.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: "none" },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "500" },
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.rule,
        },
        tabBarItemStyle: { justifyContent: "center" },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="tags" options={{ title: "Tags" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
