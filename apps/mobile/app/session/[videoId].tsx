import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  YouTubePlayerView,
  type YouTubePlayerHandle,
} from "@/src/components/YouTubePlayer";
import { TranscriptView } from "@/src/components/TranscriptView";
import { TranslationSheet } from "@/src/components/TranslationSheet";
import {
  getChunksForVideo,
  getVideo,
  touchVideo,
} from "@/src/db/repos/videos";
import { getSession, updateSessionProgress } from "@/src/db/repos/sessions";
import { useSettingsStore } from "@/src/store/settings";
import type { Chunk } from "@shadowtube/shared";

export default function SessionScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState("");
  const [selectedContext, setSelectedContext] = useState("");

  const geminiKey = useSettingsStore((s) => s.geminiKey);

  const current = chunks[index];

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const playChunk = useCallback(
    (chunkIdx: number) => {
      const c = chunks[chunkIdx];
      if (!c || !ready) return;
      clearPoll();
      setPlaying(true);
      playerRef.current?.seekTo(c.start);

      pollRef.current = setInterval(async () => {
        const t = await playerRef.current?.getCurrentTime();
        if (t == null || t < c.end - 0.05) return;
        playerRef.current?.seekTo(c.start);
        setPlaying(false);
        clearPoll();
      }, 150);
    },
    [chunks, ready, clearPoll],
  );

  useEffect(() => {
    if (!videoId) return;
    (async () => {
      setLoading(true);
      const [video, rows, session] = await Promise.all([
        getVideo(videoId),
        getChunksForVideo(videoId),
        getSession(videoId),
      ]);
      if (video) setTitle(video.title);
      const mapped: Chunk[] = rows.map((r) => ({
        start: r.startSec,
        end: r.endSec,
        text: r.text,
      }));
      setChunks(mapped);
      const startIdx = session?.lastChunkIdx ?? 0;
      setIndex(Math.min(startIdx, Math.max(0, mapped.length - 1)));
      await touchVideo(videoId);
      setLoading(false);
    })();
    return () => clearPoll();
  }, [videoId, clearPoll]);

  useEffect(() => {
    if (!videoId || chunks.length === 0) return;
    updateSessionProgress(videoId, index);
  }, [videoId, index, chunks.length]);

  useEffect(() => {
    if (ready && chunks.length > 0) {
      playChunk(index);
    }
  }, [ready, index, chunks.length, playChunk]);

  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const goNext = () => {
    if (index < chunks.length - 1) setIndex(index + 1);
  };

  const replay = () => playChunk(index);

  const handleWordPress = (word: string, context: string) => {
    if (!word) return;
    setSelectedWord(word);
    setSelectedContext(context);
    setSheetVisible(true);
    setPlaying(false);
    clearPoll();
  };

  if (loading || !videoId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7eb8ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoId ? (
        <YouTubePlayerView
          ref={playerRef}
          videoId={videoId}
          playing={playing}
          onReady={() => setReady(true)}
        />
      ) : null}

      <Text style={styles.progress}>
        {title ? `${title.slice(0, 40)}… · ` : ""}
        Чанк {index + 1} / {chunks.length}
      </Text>

      <TranscriptView
        chunks={chunks}
        currentIndex={index}
        onWordPress={handleWordPress}
      />

      <View style={styles.controls}>
        <Pressable
          style={[styles.ctrlBtn, index === 0 && styles.ctrlDisabled]}
          onPress={goPrev}
          disabled={index === 0}
        >
          <Text style={styles.ctrlText}>⏮ Prev</Text>
        </Pressable>
        <Pressable style={styles.ctrlBtnMain} onPress={replay}>
          <Text style={styles.ctrlTextMain}>🔁 Replay</Text>
        </Pressable>
        <Pressable
          style={[
            styles.ctrlBtn,
            index >= chunks.length - 1 && styles.ctrlDisabled,
          ]}
          onPress={goNext}
          disabled={index >= chunks.length - 1}
        >
          <Text style={styles.ctrlText}>Next ⏭</Text>
        </Pressable>
      </View>

      <TranslationSheet
        visible={sheetVisible}
        word={selectedWord}
        context={selectedContext}
        apiKey={geminiKey}
        sourceVideoId={videoId}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f14" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f0f14" },
  progress: {
    color: "#888",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  controls: {
    flexDirection: "row",
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#2a2a3a",
  },
  ctrlBtn: {
    flex: 1,
    backgroundColor: "#1a1a24",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  ctrlBtnMain: {
    flex: 1.2,
    backgroundColor: "#4361ee",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  ctrlDisabled: { opacity: 0.35 },
  ctrlText: { color: "#fff", fontWeight: "600" },
  ctrlTextMain: { color: "#fff", fontWeight: "700" },
});
