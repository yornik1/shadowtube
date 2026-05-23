import { useFonts } from "expo-font";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import "react-native-reanimated";
import { useSettingsStore } from "@/src/store/settings";
import { DevErrorBoundary } from "@/src/components/DevErrorBoundary";

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View style={eb.wrap}>
      <Text style={eb.title}>Something went wrong</Text>
      <Text style={eb.message}>{error.message}</Text>
      {__DEV__ && error.stack ? (
        <Text style={eb.stack} numberOfLines={12}>
          {error.stack}
        </Text>
      ) : null}
      <Pressable style={eb.btn} onPress={retry}>
        <Text style={eb.btnText}>Повторить</Text>
      </Pressable>
    </View>
  );
}

const eb = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#1a0a0a",
    padding: 24,
    justifyContent: "center",
  },
  title: { color: "#ff6b6b", fontSize: 20, fontWeight: "700", marginBottom: 8 },
  message: { color: "#fff", fontSize: 15, marginBottom: 12 },
  stack: { color: "#888", fontSize: 10, marginBottom: 16 },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0f0f14",
    card: "#1a1a24",
    primary: "#4361ee",
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    loadSettings().catch((e) =>
      console.warn("[ShadowTube] settings load:", e),
    );
  }, [loadSettings]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <DevErrorBoundary>
      <ThemeProvider value={theme}>
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
