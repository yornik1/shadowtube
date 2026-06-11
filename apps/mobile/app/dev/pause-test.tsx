import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
} from "react-native";
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SessionScreenContent } from "@/src/session/SessionScreenContent";
import {
  PAUSE_TEST_CHUNKS,
  PAUSE_TEST_VIDEO_ID,
} from "@/src/session/pauseTestFixtures";
import { fetchMetadata, fetchTranscript } from "@/src/api/transcript";
import { chunk } from "@/src/chunking/chunker";
import { getChunksForVideo, getVideo } from "@/src/db/repos/videos";
import type { Chunk } from "@shadowtube/shared";

function HomeButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.homeBtn} hitSlop={8}>
      <Text style={styles.homeBtnText}>← Home</Text>
    </Pressable>
  );
}

export default function PauseTestScreen() {
  const { run, videoId: videoIdParam } = useLocalSearchParams<{
    run?: string;
    videoId?: string;
  }>();
  const router = useRouter();
  const goHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const videoId = (videoIdParam?.trim() || PAUSE_TEST_VIDEO_ID) as string;
  const useFixtures = videoId === PAUSE_TEST_VIDEO_ID;

  const [chunks, setChunks] = useState<Chunk[] | null>(
    useFixtures ? PAUSE_TEST_CHUNKS : null,
  );
  const [title, setTitle] = useState(
    useFixtures ? "Pause E2E Test" : "",
  );
  const [loading, setLoading] = useState(!useFixtures);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [goHome]),
  );

  useEffect(() => {
    if (useFixtures) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [video, rows] = await Promise.all([
          getVideo(videoId),
          getChunksForVideo(videoId),
        ]);
        if (video) setTitle(video.title);
        if (rows.length > 0) {
          setChunks(
            rows.map((r) => ({
              start: r.startSec,
              end: r.endSec,
              text: r.text,
            })),
          );
          return;
        }

        const [transcript, meta] = await Promise.all([
          fetchTranscript(videoId, "en"),
          fetchMetadata(videoId),
        ]);
        const chunked = chunk(transcript.segments);
        if (chunked.length === 0) {
          throw new Error("Не удалось разбить субтитры на чанки");
        }
        setTitle(meta.title);
        setChunks(chunked);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [videoId, useFixtures]);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: useFixtures ? "Pause E2E" : "Pause dev",
          headerLeft: () => <HomeButton onPress={goHome} />,
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7eb8ff" />
          <Text style={styles.loadingText}>Загрузка чанков…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={goHome}>
            <Text style={styles.retryText}>← Home</Text>
          </Pressable>
        </View>
      ) : chunks && chunks.length > 0 ? (
        <SessionScreenContent
          key={run ?? "default"}
          videoId={videoId}
          chunks={chunks}
          title={title}
          autoReplayOnReady
          showE2eStatus
          e2eUsesFixtures={useFixtures}
        />
      ) : (
        <View style={styles.center}>
          <Text style={styles.errorText}>Нет чанков</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  homeBtn: { paddingVertical: 4, paddingHorizontal: 8, marginLeft: 4 },
  homeBtnText: { color: "#7eb8ff", fontSize: 16, fontWeight: "600" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f14",
    gap: 12,
    padding: 20,
  },
  loadingText: { color: "#888", fontSize: 14 },
  errorText: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
  retryBtn: {
    backgroundColor: "#4361ee",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "600" },
});
