import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet, ScrollView } from "react-native";
import Constants from "expo-constants";
import { DevErrorBoundary } from "@/src/components/DevErrorBoundary";
import { useSettingsStore } from "@/src/store/settings";
import { installDevLog } from "@/src/utils/devLog";

installDevLog();

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={eb.wrap}>
      <Text style={eb.title}>Ошибка</Text>
      <Text style={eb.message} selectable>
        {error.message || "Unknown error"}
      </Text>
      <Text style={eb.stack} selectable>
        {error.stack ?? "no stack"}
      </Text>
      <Pressable style={eb.btn} onPress={retry}>
        <Text style={eb.btnText}>Повторить</Text>
      </Pressable>
    </ScrollView>
  );
}

const eb = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: "#1a0a0a", padding: 20, paddingTop: 48 },
  title: { color: "#ff6b6b", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  message: { color: "#fff", fontSize: 16, marginBottom: 12 },
  stack: { color: "#aaa", fontSize: 11, marginBottom: 20 },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0f0f14",
    card: "#1a1a24",
    primary: "#4361ee",
  },
};

function BootBanner() {
  const sdk = Constants.expoConfig?.sdkVersion ?? "?";
  const runtime = Constants.expoRuntimeVersion ?? "?";
  return (
    <View style={boot.wrap}>
      <Text style={boot.text}>
        SDK {sdk} · runtime {runtime}
      </Text>
      <Text style={boot.sub}>
        Нужен Expo Go с SDK 56. Обновите из Play Store.
      </Text>
    </View>
  );
}

const boot = StyleSheet.create({
  wrap: {
    backgroundColor: "#2a3a5a",
    padding: 8,
    paddingHorizontal: 12,
  },
  text: { color: "#fff", fontSize: 12, fontWeight: "600" },
  sub: { color: "#aac", fontSize: 11, marginTop: 2 },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const load = useSettingsStore((s) => s.load);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    load();
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>ShadowTube…</Text>
      </View>
    );
  }

  return (
    <DevErrorBoundary>
      <ThemeProvider value={theme}>
        <BootBanner />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="session/[videoId]"
            options={{
              title: "Shadowing",
              headerShown: true,
              headerStyle: { backgroundColor: "#0f0f14" },
              headerTintColor: "#fff",
            }}
          />
        </Stack>
      </ThemeProvider>
    </DevErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#4361ee",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: "#fff", fontSize: 22, fontWeight: "700" },
});
