import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import type { Chunk } from "@shadowtube/shared";

type Props = {
  chunks: Chunk[];
  currentIndex: number;
  onWordPress: (word: string, context: string) => void;
};

function tokenize(text: string): { type: "word" | "space"; value: string }[] {
  const tokens: { type: "word" | "space"; value: string }[] = [];
  const parts = text.split(/(\s+)/);
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$/.test(p)) tokens.push({ type: "space", value: p });
    else tokens.push({ type: "word", value: p });
  }
  return tokens;
}

function ChunkBlock({
  chunk,
  active,
  dim,
  onWordPress,
}: {
  chunk: Chunk;
  active: boolean;
  dim: boolean;
  onWordPress: (word: string, context: string) => void;
}) {
  const tokens = tokenize(chunk.text);
  const body = (
    <Text
      style={[
        styles.chunkText,
        active && styles.activeText,
        dim && styles.dimText,
      ]}
    >
      {tokens.map((t, i) =>
        t.type === "word" ? (
          <Text
            key={i}
            onPress={() => onWordPress(t.value.replace(/[^\w'-]/g, ""), chunk.text)}
            style={active ? styles.tappable : styles.tappableDim}
          >
            {t.value}
          </Text>
        ) : (
          <Text key={i}>{t.value}</Text>
        ),
      )}
    </Text>
  );

  return (
    <View style={[styles.chunk, dim && styles.dim, active && styles.active]}>
      {active ? (
        <ScrollView style={styles.activeScroll} nestedScrollEnabled>
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

export function TranscriptView({ chunks, currentIndex, onWordPress }: Props) {
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
      {prev && (
        <ChunkBlock chunk={prev} active={false} dim onWordPress={onWordPress} />
      )}
      <ChunkBlock
        chunk={current}
        active
        dim={false}
        onWordPress={onWordPress}
      />
      {next && (
        <ChunkBlock chunk={next} active={false} dim onWordPress={onWordPress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  chunk: { paddingVertical: 8 },
  active: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    maxHeight: 220,
  },
  activeScroll: { flexGrow: 0 },
  dim: { opacity: 0.45 },
  chunkText: { fontSize: 16, lineHeight: 26, color: "#888" },
  activeText: { fontSize: 22, lineHeight: 32, color: "#fff" },
  dimText: { fontSize: 14 },
  tappable: { color: "#7eb8ff", textDecorationLine: "underline" },
  tappableDim: { color: "#5a7a99" },
  empty: { color: "#666", textAlign: "center" },
});
