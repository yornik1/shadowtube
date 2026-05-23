import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSettingsStore } from "@/src/store/settings";
import { testApiKey } from "@/src/api/gemini";
import Constants from "expo-constants";

export default function SettingsScreen() {
  const { geminiKey, saveKey, loaded } = useSettingsStore();
  const [draft, setDraft] = useState("");
  const [testing, setTesting] = useState(false);

  const proxyUrl =
    Constants.expoConfig?.extra?.proxyUrl ??
    process.env.EXPO_PUBLIC_PROXY_URL ??
    "http://localhost:8787";

  const handleSave = async () => {
    if (!draft.trim()) {
      Alert.alert("Ошибка", "Введите API key");
      return;
    }
    await saveKey(draft.trim());
    Alert.alert("Сохранено", "Gemini API key сохранён в SecureStore");
  };

  const handleTest = async () => {
    const key = draft.trim() || geminiKey;
    if (!key) {
      Alert.alert("Ошибка", "Сначала введите ключ");
      return;
    }
    setTesting(true);
    const ok = await testApiKey(key);
    setTesting(false);
    Alert.alert(ok ? "OK" : "Ошибка", ok ? "Ключ работает" : "Проверьте ключ");
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7eb8ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Gemini API Key (BYOK)</Text>
      <Text style={styles.hint}>
        Получите бесплатный ключ в Google AI Studio (~1500 req/day)
      </Text>
      <Pressable
        onPress={() =>
          Linking.openURL("https://aistudio.google.com/apikey")
        }
      >
        <Text style={styles.link}>Открыть Google AI Studio →</Text>
      </Pressable>

      <TextInput
        style={styles.input}
        placeholder="AIza..."
        placeholderTextColor="#666"
        value={draft || geminiKey || ""}
        onChangeText={setDraft}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Pressable style={styles.btn} onPress={handleSave}>
        <Text style={styles.btnText}>Сохранить ключ</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.btnSecondary]}
        onPress={handleTest}
        disabled={testing}
      >
        {testing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Проверить ключ</Text>
        )}
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.label}>Proxy URL</Text>
        <Text style={styles.mono}>{proxyUrl}</Text>
        <Text style={styles.hintSmall}>
          Задайте EXPO_PUBLIC_PROXY_URL или extra.proxyUrl в app.config
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Языки (MVP)</Text>
        <Text style={styles.hint}>English → Russian (фиксировано)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14", padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f0f14" },
  label: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 6 },
  hint: { fontSize: 13, color: "#888", marginBottom: 8 },
  hintSmall: { fontSize: 12, color: "#666", marginTop: 6 },
  link: { color: "#7eb8ff", marginBottom: 16, fontSize: 14 },
  input: {
    backgroundColor: "#1a1a24",
    borderRadius: 10,
    padding: 14,
    color: "#fff",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  btnSecondary: { backgroundColor: "#2a3a5a" },
  btnText: { color: "#fff", fontWeight: "600" },
  section: { marginTop: 24 },
  mono: { color: "#aaa", fontFamily: "monospace", fontSize: 12 },
});
