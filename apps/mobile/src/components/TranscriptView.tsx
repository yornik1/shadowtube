import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { Chunk } from "@shadowtube/shared";
import {
  isSelected,
  nearestWordIndex,
  tokenize,
  type Selection,
} from "@/src/session/spanSelection";
import { colors, font, radius, space } from "@/src/ui/theme";

type Props = {
  chunks: Chunk[];
  currentIndex: number;
  /** Выделение внутри активного чанка (индексы токенов). */
  selection: Selection | null;
  onWordPress: (tokenIndex: number) => void;
  /** Русский перевод активного чанка — показывается по кнопке «RU». */
  translation?: string | null;
  translationLoading?: boolean;
};

/** Соседний чанк: только контекст, тапать нечего — меньше промахов. */
function NeighborChunk({ chunk }: { chunk: Chunk }) {
  return (
    <Text style={styles.neighbor} numberOfLines={2}>
      {chunk.text}
    </Text>
  );
}

function ActiveChunk({
  chunk,
  selection,
  onWordPress,
}: {
  chunk: Chunk;
  selection: Selection | null;
  onWordPress: (tokenIndex: number) => void;
}) {
  const tokens = useMemo(() => tokenize(chunk.text), [chunk.text]);

  return (
    <Text style={styles.activeText}>
      {tokens.map((t) => (
        // Пробелы тоже кликабельны и отдаются соседнему слову — иначе тап
        // «мимо буквы» выглядит как зависшее приложение.
        <Text
          key={t.index}
          onPress={() => {
            const target = nearestWordIndex(tokens, t.index);
            if (target != null) onWordPress(target);
          }}
          suppressHighlighting
          style={
            isSelected(selection, t.index)
              ? styles.wordSelected
              : t.type === "word"
                ? styles.word
                : undefined
          }
        >
          {t.value}
        </Text>
      ))}
    </Text>
  );
}

export function TranscriptView({
  chunks,
  currentIndex,
  selection,
  onWordPress,
  translation,
  translationLoading = false,
}: Props) {
  const prev = chunks[currentIndex - 1];
  const current = chunks[currentIndex];
  const next = chunks[currentIndex + 1];

  if (!current) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Нет чанков</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {prev ? <NeighborChunk chunk={prev} /> : null}

      <View style={styles.activeCard}>
        <ScrollView style={styles.activeScroll} nestedScrollEnabled>
          <ActiveChunk
            chunk={current}
            selection={selection}
            onWordPress={onWordPress}
          />

          {translationLoading ? (
            <Text style={styles.translationPending}>перевод…</Text>
          ) : translation ? (
            <View style={styles.translationBox}>
              <Text style={styles.translation}>{translation}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      {next ? <NeighborChunk chunk={next} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  neighbor: {
    ...font.small,
    color: colors.textFaint,
    textAlign: "center",
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    maxHeight: 260,
  },
  activeScroll: { flexGrow: 0 },
  activeText: { ...font.display, color: colors.text },
  word: { color: colors.text },
  /** Выделение подсвечивается фоном — подчёркивание на каждом слове рябит. */
  wordSelected: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  translationBox: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  translation: { ...font.body, color: colors.textMuted },
  translationPending: {
    ...font.small,
    color: colors.textFaint,
    marginTop: space.md,
    fontStyle: "italic",
  },
  empty: { ...font.body, color: colors.textFaint, textAlign: "center" },
});
