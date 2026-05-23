import { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { translateWord } from "@/src/api/gemini";
import { addVocabularyEntry } from "@/src/db/repos/vocabulary";
import type { TranslationResult } from "@shadowtube/shared";

type Props = {
  visible: boolean;
  word: string;
  context: string;
  apiKey: string | null;
  sourceVideoId?: string;
  onClose: () => void;
};

export function TranslationSheet({
  visible,
  word,
  context,
  apiKey,
  sourceVideoId,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !word) return;
    setResult(null);
    setError(null);
    if (!apiKey) {
      setError("Добавьте Gemini API key в Настройках");
      return;
    }
    setLoading(true);
    translateWord(apiKey, word, context)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка перевода"))
      .finally(() => setLoading(false));
  }, [visible, word, context, apiKey]);

  const handleSave = async () => {
    if (!result) return;
    try {
      await addVocabularyEntry({
        word,
        context,
        translation: result.translation,
        sourceVideoId,
      });
      Alert.alert("Сохранено", `"${word}" добавлено в словарь`);
      onClose();
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось сохранить");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.word}>{word}</Text>
          <Text style={styles.context} numberOfLines={3}>
            {context}
          </Text>
          {loading && <ActivityIndicator color="#7eb8ff" style={styles.loader} />}
          {error && <Text style={styles.error}>{error}</Text>}
          {result && (
            <>
              <Text style={styles.translation}>{result.translation}</Text>
              {result.partOfSpeech && (
                <Text style={styles.meta}>{result.partOfSpeech}</Text>
              )}
              {result.example && (
                <Text style={styles.example}>{result.example}</Text>
              )}
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Сохранить в словарь</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#1e1e2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    minHeight: 200,
  },
  word: { fontSize: 24, fontWeight: "700", color: "#fff", marginBottom: 8 },
  context: { fontSize: 14, color: "#888", marginBottom: 16 },
  translation: { fontSize: 28, color: "#7eb8ff", marginBottom: 8 },
  meta: { fontSize: 14, color: "#aaa", marginBottom: 4 },
  example: { fontSize: 14, color: "#ccc", fontStyle: "italic", marginBottom: 16 },
  error: { color: "#ff6b6b", marginBottom: 12 },
  loader: { marginVertical: 16 },
  saveBtn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  closeBtn: { marginTop: 12, alignItems: "center", padding: 8 },
  closeBtnText: { color: "#888", fontSize: 15 },
});
