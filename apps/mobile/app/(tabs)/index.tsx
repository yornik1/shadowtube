import { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";

type HomeModule = typeof import("./home");

export default function HomeScreen() {
  const [mod, setMod] = useState<HomeModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    import("./home")
      .then(setMod)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[ShadowTube] home load:", e);
        setLoadError(msg + (e instanceof Error && e.stack ? "\n" + e.stack : ""));
      });
  }, []);

  if (loadError) {
    return (
      <ScrollView contentContainerStyle={styles.err}>
        <Text style={styles.errTitle}>Не загрузился экран</Text>
        <Text style={styles.errBody} selectable>
          {loadError}
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => {
            setLoadError(null);
            setMod(null);
            import("./home").then(setMod).catch((e) =>
              setLoadError(e instanceof Error ? e.message : String(e)),
            );
          }}
        >
          <Text style={styles.btnText}>Повторить</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!mod) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#7eb8ff" />
        <Text style={styles.loadingText}>Загрузка…</Text>
      </View>
    );
  }

  return <mod.HomeContent />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#0f0f14",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: "#888", fontSize: 16 },
  err: {
    flexGrow: 1,
    backgroundColor: "#0f0f14",
    padding: 20,
    paddingTop: 40,
  },
  errTitle: { color: "#ff6b6b", fontSize: 20, fontWeight: "700", marginBottom: 12 },
  errBody: { color: "#ccc", fontSize: 13, lineHeight: 20, marginBottom: 20 },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
