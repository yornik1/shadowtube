import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#7eb8ff",
        tabBarInactiveTintColor: "#666",
        tabBarStyle: { backgroundColor: "#1a1a24", borderTopColor: "#2a2a3a" },
        headerStyle: { backgroundColor: "#0f0f14" },
        headerTintColor: "#fff",
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarLabel: "Главная",
        }}
      />
      <Tabs.Screen
        name="vocabulary"
        options={{
          title: "Словарь",
          tabBarLabel: "Словарь",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Настройки",
          tabBarLabel: "Настройки",
        }}
      />
    </Tabs>
  );
}
