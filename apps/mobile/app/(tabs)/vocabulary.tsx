import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  listVocabulary,
  deleteVocabulary,
} from "@/src/db/repos/vocabulary";

type VocabRow = Awaited<ReturnType<typeof listVocabulary>>[number];

export default function VocabularyScreen() {
  const [items, setItems] = useState<VocabRow[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const rows = await listVocabulary(search);
    setItems(rows);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleDelete = (id: number, word: string) => {
    Alert.alert("Удалить?", `"${word}"`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteVocabulary(id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Поиск..."
        placeholderTextColor="#666"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={load}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Словарь пуст. Тапните на слово во время сессии.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onLongPress={() => handleDelete(item.id, item.word)}
          >
            <Text style={styles.word}>{item.word}</Text>
            <Text style={styles.translation}>{item.translation}</Text>
            <Text style={styles.context} numberOfLines={2}>
              {item.context}
            </Text>
            <Text style={styles.hint}>Долгое нажатие — удалить</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14" },
  search: {
    margin: 16,
    backgroundColor: "#1a1a24",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: {
    backgroundColor: "#1a1a24",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  word: { fontSize: 18, fontWeight: "700", color: "#7eb8ff" },
  translation: { fontSize: 16, color: "#fff", marginTop: 4 },
  context: { fontSize: 13, color: "#888", marginTop: 6 },
  hint: { fontSize: 11, color: "#555", marginTop: 8 },
});
