import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Painel" }} />
      <Tabs.Screen name="tarefas" options={{ title: "Tarefas" }} />
      <Tabs.Screen name="tags" options={{ title: "Tags" }} />
      <Tabs.Screen name="historico" options={{ title: "Histórico" }} />
      <Tabs.Screen name="definicoes" options={{ title: "Definições" }} />
    </Tabs>
  );
}
