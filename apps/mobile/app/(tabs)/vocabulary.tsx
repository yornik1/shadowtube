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
import { router, useFocusEffect } from "expo-router";
import {
  listVocabulary,
  deleteVocabulary,
  type VocabularyRow,
} from "@/src/db/repos/vocabulary";
import { useDueStore, refreshDueCount } from "@/src/srs/dueStore";
import { formatDue } from "@/src/srs/sm2";
import { Badge, Button, EmptyState } from "@/src/ui/components";
import { toast } from "@/src/ui/toast";
import { colors, font, radius, space } from "@/src/ui/theme";

export default function VocabularyScreen() {
  const [items, setItems] = useState<VocabularyRow[]>([]);
  const [search, setSearch] = useState("");
  const dueCount = useDueStore((s) => s.count);

  const load = useCallback(async () => {
    setItems(await listVocabulary(search));
    refreshDueCount();
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleDelete = (item: VocabularyRow) => {
    Alert.alert("Удалить из словаря?", `«${item.word}»`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteVocabulary(item.id);
          toast.info("Удалено");
          void load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {dueCount > 0 ? (
        <Button
          title={`🔥 Повторить ${dueCount}`}
          variant="primary"
          onPress={() => router.push("/(tabs)/review")}
          style={styles.reviewBtn}
        />
      ) : null}

      <TextInput
        style={styles.search}
        placeholder="Поиск по фразе, переводу, контексту"
        placeholderTextColor={colors.textFaint}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={load}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          search ? (
            <EmptyState emoji="🔍" title="Ничего не найдено" />
          ) : (
            <EmptyState
              emoji="📖"
              title="Словарь пуст"
              hint="Во время сессии тапните по слову, вторым тапом растяните выделение на фразу — и сохраните."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onLongPress={() => handleDelete(item)}
            delayLongPress={400}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.word}>{item.word}</Text>
              {item.kind === "chunk" ? (
                <Badge label="чанк" color={colors.textFaint} />
              ) : null}
            </View>

            <Text style={styles.translation}>{item.translation}</Text>

            {item.definitionEn ? (
              <Text style={styles.definition} numberOfLines={2}>
                {item.definitionEn}
              </Text>
            ) : null}

            {item.context && item.context !== item.word ? (
              <Text style={styles.context} numberOfLines={2}>
                {item.context}
              </Text>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.due}>{formatDue(item.dueAt)}</Text>
              {item.reps > 0 ? (
                <Text style={styles.reps}>· повторов: {item.reps}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  reviewBtn: { marginHorizontal: space.lg, marginTop: space.md },
  search: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    ...font.small,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
    gap: space.xs,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  word: { ...font.body, color: colors.accent, fontWeight: "700", flexShrink: 1 },
  translation: { ...font.body, color: colors.text },
  definition: { ...font.small, color: colors.textMuted, fontStyle: "italic" },
  context: { ...font.caption, color: colors.textFaint },
  footer: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  due: { ...font.caption, color: colors.textFaint },
  reps: { ...font.caption, color: colors.textFaint },
});
