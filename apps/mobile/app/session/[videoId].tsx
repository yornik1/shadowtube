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
import { prefetchChunkTranslations } from "@/src/api/gemini";
import type { Chunk } from "@shadowtube/shared";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guardRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playStartedAtRef = useRef(0);
  const playingRef = useRef(false);

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
  const geminiModel = useSettingsStore((s) => s.geminiModel);

  const current = chunks[index];

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const clearGuard = useCallback(() => {
    if (guardRef.current) {
      clearInterval(guardRef.current);
      guardRef.current = null;
    }
  }, []);

  /** Keep video inside [chunk.start, chunk.end). Never auto-advance index. */
  const clampToChunk = useCallback(
    async (c: Chunk, pause: boolean) => {
      const t = await playerRef.current?.getCurrentTime();
      const pos = t != null && t > 0 ? t : c.start;
      if (pos >= c.end - 0.05 || pos < c.start - 0.05) {
        playerRef.current?.seekTo(c.start);
      }
      if (pause) setPlaying(false);
    },
    [],
  );

  /** Seek to chunk start and pause — used on chunk switch and after end. */
  const alignToChunk = useCallback(
    (chunkIdx: number) => {
      const c = chunks[chunkIdx];
      if (!c || !ready) return;
      clearPoll();
      setPlaying(false);
      playerRef.current?.seekTo(c.start);
    },
    [chunks, ready, clearPoll],
  );

  const playChunk = useCallback(
    (chunkIdx: number) => {
      const c = chunks[chunkIdx];
      if (!c || !ready) return;
      clearPoll();
      playStartedAtRef.current = Date.now();
      playerRef.current?.seekTo(c.start);
      setPlaying(true);

      const chunkDurationMs = Math.max((c.end - c.start) * 1000, 300);

      pollRef.current = setInterval(async () => {
        const elapsed = Date.now() - playStartedAtRef.current;
        const t = await playerRef.current?.getCurrentTime();
        // Bridge often returns 0 — estimate from wall clock
        const pos =
          t != null && t > 0 ? t : c.start + elapsed / 1000;

        if (pos >= c.end - 0.08 || elapsed >= chunkDurationMs + 200) {
          playerRef.current?.seekTo(c.start);
          setPlaying(false);
          clearPoll();
        } else if (pos < c.start - 0.1) {
          playerRef.current?.seekTo(c.start);
        }
      }, 100);
    },
    [chunks, ready, clearPoll],
  );

  /** While paused: snap back if user scrubbed past chunk bounds. */
  useEffect(() => {
    if (!ready || !current || playing) {
      clearGuard();
      return;
    }
    guardRef.current = setInterval(() => {
      clampToChunk(current, false);
    }, 400);
    return () => clearGuard();
  }, [ready, current, playing, clampToChunk, clearGuard]);

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
    return () => {
      clearPoll();
      clearGuard();
    };
  }, [videoId, clearPoll, clearGuard]);

  useEffect(() => {
    if (!videoId || chunks.length === 0) return;
    updateSessionProgress(videoId, index);
  }, [videoId, index, chunks.length]);

  useEffect(() => {
    if (ready && chunks.length > 0) {
      alignToChunk(index);
    }
  }, [ready, index, chunks.length, alignToChunk]);

  useEffect(() => {
    if (!geminiKey || !current?.text) return;
    prefetchChunkTranslations(geminiKey, current.text, geminiModel);
  }, [geminiKey, geminiModel, current?.text]);

  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const goNext = () => {
    if (index < chunks.length - 1) setIndex(index + 1);
  };

  const replay = () => playChunk(index);

  const handleWordPress = (word: string, context: string) => {
    if (!word || !current) return;
    setSelectedWord(word);
    setSelectedContext(context);
    setSheetVisible(true);
    clearPoll();
    setPlaying(false);
    playerRef.current?.seekTo(current.start);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
    if (current) {
      playerRef.current?.seekTo(current.start);
      setPlaying(false);
    }
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
          onStateChange={(state) => {
            if (state === "playing" && !playingRef.current && current) {
              playerRef.current?.seekTo(current.start);
              setPlaying(false);
            }
          }}
        />
      ) : null}

      <Text style={styles.progress} numberOfLines={2}>
        {title ? `${title} · ` : ""}
        Чанк {index + 1} / {chunks.length}
        {current
          ? ` · ${formatTime(current.start)}–${formatTime(current.end)}`
          : ""}
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
        onClose={handleSheetClose}
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
