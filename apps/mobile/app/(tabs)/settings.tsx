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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSettingsStore } from "@/src/store/settings";
import { verifyApiKey, pickDefaultModel } from "@/src/api/gemini";
import Constants from "expo-constants";

export default function SettingsScreen() {
  const {
    geminiKey,
    saveKey,
    loaded,
    geminiModel,
    saveModel,
    availableModels,
    setAvailableModels,
  } = useSettingsStore();
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
    setDraft("");
    Alert.alert("Сохранено", "Ключ сохранён. Нажмите «Проверить ключ» для списка моделей.");
  };

  const handleTest = async () => {
    const key = draft.trim() || geminiKey;
    if (!key) {
      Alert.alert("Ошибка", "Сначала введите ключ");
      return;
    }
    setTesting(true);
    const result = await verifyApiKey(key);
    setTesting(false);

    if (!result.ok) {
      Alert.alert("Ошибка", result.error);
      return;
    }

    setAvailableModels(result.models);

    const ids = new Set(result.models.map((m) => m.id));
    if (!ids.has(geminiModel)) {
      const picked = pickDefaultModel(result.models);
      await saveModel(picked);
    }

    Alert.alert(
      "OK",
      `Ключ работает. Доступно моделей: ${result.models.length}. Выберите ниже.`,
    );
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7eb8ff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Gemini API Key (BYOK)</Text>
        <Text style={styles.hint}>Бесплатный ключ в Google AI Studio</Text>
        <Pressable onPress={() => Linking.openURL("https://aistudio.google.com/apikey")}>
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
            <Text style={styles.btnText}>Проверить ключ и загрузить модели</Text>
          )}
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.label}>Модель для перевода</Text>
          <Text style={styles.hint}>Выбрана: {geminiModel}</Text>

          {availableModels.length === 0 ? (
            <Text style={styles.hintSmall}>
              Список моделей появится после проверки ключа
            </Text>
          ) : (
            <View style={styles.chips}>
              {availableModels.map((m) => {
                const active = geminiModel === m.id;
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => saveModel(m.id)}
                  >
                    <Text style={[styles.chipTitle, active && styles.chipTextActive]}>
                      {m.displayName}
                    </Text>
                    <Text style={styles.chipId}>{m.id}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Proxy URL</Text>
          <Text style={styles.mono} selectable>
            {proxyUrl}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Языки (MVP)</Text>
          <Text style={styles.hint}>English → Russian</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#0f0f14" },
  container: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f0f14" },
  label: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 6 },
  hint: { fontSize: 13, color: "#888", marginBottom: 8 },
  hintSmall: { fontSize: 12, color: "#666", marginTop: 4 },
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
  btnText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  section: { marginTop: 24 },
  mono: { color: "#aaa", fontSize: 12 },
  chips: { gap: 8 },
  chip: {
    backgroundColor: "#1a1a24",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  chipActive: {
    borderColor: "#4361ee",
    backgroundColor: "#2a3a5a",
  },
  chipTitle: { color: "#ccc", fontSize: 14, fontWeight: "500" },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  chipId: { color: "#666", fontSize: 11, marginTop: 4, fontFamily: "monospace" },
});
