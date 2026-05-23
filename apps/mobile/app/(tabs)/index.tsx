import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { extractVideoId } from "@/src/utils/youtube";
import { fetchTranscript, fetchMetadata } from "@/src/api/transcript";
import { chunk } from "@/src/chunking/chunker";
import {
  upsertVideo,
  listRecentVideos,
  getChunksForVideo,
} from "@/src/db/repos/videos";
import { getSession } from "@/src/db/repos/sessions";

type HistoryItem = Awaited<ReturnType<typeof listRecentVideos>>[number];

export default function HomeScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setDbError(null);
      const items = await listRecentVideos();
      setHistory(items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ShadowTube] loadHistory:", e);
      setDbError(msg);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  const startSession = async (videoId: string, fromUrl?: string) => {
    setLoading(true);
    try {
      const existingChunks = await getChunksForVideo(videoId);
      if (existingChunks.length === 0) {
        const [transcript, meta] = await Promise.all([
          fetchTranscript(videoId, "en"),
          fetchMetadata(videoId),
        ]);
        const chunks = chunk(transcript.segments);
        if (chunks.length === 0) {
          throw new Error("Не удалось разбить субтитры на чанки");
        }
        await upsertVideo(
          videoId,
          fromUrl ?? `https://www.youtube.com/watch?v=${videoId}`,
          meta,
          chunks,
        );
      }
      router.push(`/session/${videoId}`);
    } catch (e) {
      Alert.alert(
        "Ошибка",
        e instanceof Error ? e.message : "Не удалось загрузить видео",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      Alert.alert("Неверная ссылка", "Вставьте корректную YouTube-ссылку");
      return;
    }
    startSession(videoId, url.trim());
  };

  const handleResume = async (item: HistoryItem) => {
    await startSession(item.id);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ShadowTube</Text>
      <Text style={styles.subtitle}>Language shadowing с YouTube</Text>

      <TextInput
        style={styles.input}
        placeholder="https://youtube.com/watch?v=..."
        placeholderTextColor="#666"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleStart}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Начать</Text>
        )}
      </Pressable>

      {dbError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Ошибка базы данных</Text>
          <Text style={styles.errorText}>{dbError}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Недавние</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Пока нет видео — вставьте ссылку выше</Text>
        }
        renderItem={({ item }) => (
          <HistoryRow item={item} onResume={() => handleResume(item)} />
        )}
      />
    </View>
  );
}

function HistoryRow({
  item,
  onResume,
}: {
  item: HistoryItem;
  onResume: () => void;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    (async () => {
      const session = await getSession(item.id);
      const chunkRows = await getChunksForVideo(item.id);
      if (!session || chunkRows.length === 0) {
        setProgress(0);
        return;
      }
      setProgress(
        Math.round(((session.lastChunkIdx + 1) / chunkRows.length) * 100),
      );
    })();
  }, [item.id]);

  return (
    <Pressable style={styles.card} onPress={onResume}>
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
      ) : null}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>
          {item.channel} · {progress}%
        </Text>
        <Text style={styles.resumeLabel}>Продолжить →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14", padding: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", marginTop: 8 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 20 },
  input: {
    backgroundColor: "#1a1a24",
    borderRadius: 10,
    padding: 14,
    color: "#fff",
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a3a",
  },
  btn: {
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#aaa", marginBottom: 8 },
  list: { paddingBottom: 24 },
  empty: { color: "#666", textAlign: "center", marginTop: 24 },
  card: {
    flexDirection: "row",
    backgroundColor: "#1a1a24",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  thumb: { width: 100, height: 72 },
  cardBody: { flex: 1, padding: 10, justifyContent: "center" },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  cardMeta: { color: "#888", fontSize: 12, marginTop: 4 },
  resumeLabel: { color: "#7eb8ff", fontSize: 12, marginTop: 4 },
  errorBox: {
    backgroundColor: "#3a1a1a",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ff6b6b44",
  },
  errorTitle: { color: "#ff6b6b", fontWeight: "600", marginBottom: 4 },
  errorText: { color: "#ccc", fontSize: 13 },
});
