import { useEffect } from "react";
import { Text } from "react-native";
import { Tabs } from "expo-router";
import { useDueStore } from "@/src/srs/dueStore";
import { colors, font } from "@/src/ui/theme";

/** Эмодзи вместо иконочного шрифта — не тянем лишнюю зависимость. */
function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{symbol}</Text>
  );
}

export default function TabLayout() {
  const dueCount = useDueStore((s) => s.count);
  const refresh = useDueStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        // Высоту не задаём: навигатор сам добавляет отступ под жестовую полосу,
        // иначе подписи вкладок обрезаются снизу.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
        },
        tabBarLabelStyle: { ...font.caption, fontWeight: "600" },
        tabBarBadgeStyle: {
          backgroundColor: colors.streak,
          color: colors.text,
          fontSize: 11,
        },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Главная",
          tabBarLabel: "Главная",
          tabBarIcon: ({ focused }) => <TabIcon symbol="▶" focused={focused} />,
        }}
      />
      {/* home.tsx — helper module for index, not a standalone tab */}
      <Tabs.Screen name="home" options={{ href: null, headerShown: false }} />
      <Tabs.Screen
        name="review"
        options={{
          title: "Повторение",
          tabBarLabel: "Повторение",
          tabBarIcon: ({ focused }) => <TabIcon symbol="🔥" focused={focused} />,
          // Ноль карточек — бейджа нет, иначе он превращается в фон.
          tabBarBadge: dueCount > 0 ? dueCount : undefined,
        }}
      />
      <Tabs.Screen
        name="vocabulary"
        options={{
          title: "Словарь",
          tabBarLabel: "Словарь",
          tabBarIcon: ({ focused }) => <TabIcon symbol="📖" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Настройки",
          tabBarLabel: "Настройки",
          tabBarIcon: ({ focused }) => <TabIcon symbol="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
