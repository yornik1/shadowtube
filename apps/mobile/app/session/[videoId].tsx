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
import { dlog } from "@/src/utils/devLog";
import type { Chunk } from "@shadowtube/shared";

const CAPTION_TRIM_MS = 250;
const SEEK_SETTLE_MS = 280;
const TICK_MS = 150;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function effectiveEnd(c: Chunk, next?: Chunk): number {
  if (!next) return c.end;
  return Math.min(c.end, next.start);
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(() => r(), ms));
}

export default function SessionScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const endWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayGenRef = useRef(0);
  const readyOnceRef = useRef(false);
  // фиксируется по реальному state==='playing', чтобы wall-clock fallback
  // не убегал на время буферизации Android (500–1000 мс)
  const playStartedAtRef = useRef<number | null>(null);

  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState("");
  const [selectedContext, setSelectedContext] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);

  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const geminiModel = useSettingsStore((s) => s.geminiModel);

  const current = chunks[index];
  const nextChunk = chunks[index + 1];

  const clearEndWatcher = useCallback(() => {
    if (endWatcherRef.current) {
      clearInterval(endWatcherRef.current);
      endWatcherRef.current = null;
    }
  }, []);

  const pauseAt = useCallback(
    (startSec: number) => {
      clearEndWatcher();
      replayGenRef.current += 1;
      setPlaying(false);
      if (ready) playerRef.current?.seekTo(startSec);
    },
    [ready, clearEndWatcher],
  );

  // 150мс-опрос конца чанка. На Android getCurrentTime() из bridge часто
  // возвращает 0 пока буфер не прогрет — позиция считается гибридно:
  // bridge → wall-clock от момента, когда state реально стал 'playing'.
  const startEndWatcher = useCallback(
    (gen: number, c: Chunk, next?: Chunk) => {
      clearEndWatcher();
      playStartedAtRef.current = null;
      const endSec = effectiveEnd(c, next) - CAPTION_TRIM_MS / 1000;
      const expectedDurMs = Math.max((endSec - c.start) * 1000, 300);
      const watcherStartedAt = Date.now();
      let busy = false;
      let tickN = 0;

      dlog(
        "watcher",
        `start gen=${gen} start=${c.start.toFixed(2)} endSec=${endSec.toFixed(2)} expectedMs=${expectedDurMs}`,
      );

      const stopAtChunkEnd = (reason: string) => {
        dlog("watcher", `stop gen=${gen} reason=${reason}`);
        clearEndWatcher();
        setPlaying(false);
        setTimeout(() => {
          playerRef.current?.seekTo(c.start);
        }, 80);
      };

      endWatcherRef.current = setInterval(async () => {
        if (gen !== replayGenRef.current) {
          clearEndWatcher();
          return;
        }
        if (busy) return;
        busy = true;
        try {
          let bridgePos: number | null = null;
          try {
            const t = await playerRef.current?.getCurrentTime();
            if (typeof t === "number" && t > 0) bridgePos = t;
          } catch {
            /* bridge ещё не готов */
          }

          if (gen !== replayGenRef.current) return;

          const wallBase = playStartedAtRef.current ?? watcherStartedAt;
          const elapsedMs = Date.now() - wallBase;
          const wallPos = c.start + elapsedMs / 1000;
          const pos = bridgePos ?? wallPos;

          tickN++;
          if (tickN === 1 || tickN % 7 === 0) {
            dlog(
              "watcher",
              `tick#${tickN} bridge=${bridgePos?.toFixed(2) ?? "null"} wall=${wallPos.toFixed(2)} pos=${pos.toFixed(2)} end=${endSec.toFixed(2)} elapsed=${elapsedMs}`,
            );
          }

          const wallExpired =
            playStartedAtRef.current != null &&
            elapsedMs >= expectedDurMs + 500;

          if (pos >= endSec) {
            stopAtChunkEnd(bridgePos != null ? "bridge>=end" : "wall>=end");
          } else if (wallExpired) {
            stopAtChunkEnd("wall-cap");
          }
        } finally {
          busy = false;
        }
      }, TICK_MS);
    },
    [clearEndWatcher],
  );

  useEffect(() => {
    return () => clearEndWatcher();
  }, [clearEndWatcher]);

  useEffect(() => {
    if (!videoId) return;
    readyOnceRef.current = false;
    setReady(false);
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
  }, [videoId]);

  useEffect(() => {
    if (!videoId || chunks.length === 0) return;
    updateSessionProgress(videoId, index);
  }, [videoId, index, chunks.length]);

  useEffect(() => {
    if (!geminiKey || !current?.text) return;
    prefetchChunkTranslations(geminiKey, current.text, geminiModel);
  }, [geminiKey, geminiModel, current?.text]);

  const goToChunk = (newIndex: number) => {
    const c = chunks[newIndex];
    if (!c) return;
    setIndex(newIndex);
    pauseAt(c.start);
  };

  const goPrev = () => {
    if (index > 0) goToChunk(index - 1);
  };

  const goNext = () => {
    if (index < chunks.length - 1) goToChunk(index + 1);
  };

  const replay = async () => {
    if (!current || !ready) return;
    const gen = ++replayGenRef.current;
    dlog("replay", `gen=${gen} chunk=${index} start=${current.start.toFixed(2)} end=${current.end.toFixed(2)}`);
    clearEndWatcher();
    setPlaying(false);
    await delay(80);
    if (gen !== replayGenRef.current) return;

    playerRef.current?.seekTo(current.start);
    await delay(SEEK_SETTLE_MS);
    if (gen !== replayGenRef.current) return;

    setPlaying(true);
    startEndWatcher(gen, current, nextChunk);
  };

  const handleWordPress = (word: string, context: string) => {
    if (!word || !current) return;
    setSelectedWord(word);
    setSelectedContext(context);
    setSheetVisible(true);
    pauseAt(current.start);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
    if (current) pauseAt(current.start);
  };

  if (loading || !videoId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7eb8ff" />
      </View>
    );
  }

  const playEnd = current ? effectiveEnd(current, nextChunk) : 0;

  return (
    <View style={styles.container}>
      {videoId && current ? (
        <View style={styles.playerWrap}>
          <YouTubePlayerView
            ref={playerRef}
            videoId={videoId}
            playing={playing}
            onReady={() => {
              setPlayerError(null);
              setReady(true);
              if (!readyOnceRef.current) {
                readyOnceRef.current = true;
                playerRef.current?.seekTo(current.start);
              }
            }}
            onError={(err) => {
              console.warn("[ShadowTube] YouTube player error:", err);
              setPlayerError(err);
              pauseAt(current.start);
            }}
            onStateChange={(state) => {
              dlog("player", `state=${state}`);
              if (state === "playing") {
                playStartedAtRef.current = Date.now();
              } else if (state === "paused") {
                playStartedAtRef.current = null;
                clearEndWatcher();
              } else if (state === "ended") {
                playStartedAtRef.current = null;
                clearEndWatcher();
                setPlaying(false);
                if (current) playerRef.current?.seekTo(current.start);
              }
            }}
          />
          {!ready && !playerError ? (
            <View style={styles.playerOverlay}>
              <ActivityIndicator color="#7eb8ff" />
              <Text style={styles.playerOverlayText}>Загрузка плеера…</Text>
            </View>
          ) : null}
          {playerError ? (
            <View style={styles.playerOverlay}>
              <Text style={styles.playerErrorText}>
                YouTube: {playerError}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.progress} numberOfLines={2}>
        {title ? `${title} · ` : ""}
        Чанк {index + 1} / {chunks.length}
        {current
          ? ` · ${formatTime(current.start)}–${formatTime(playEnd)}`
          : ""}
      </Text>

      <TranscriptView
        chunks={chunks}
        currentIndex={index}
        onWordPress={handleWordPress}
      />

      <Text style={styles.hint}>
        Replay → слушайте → повторяйте вслух → Next
      </Text>

      <View style={styles.controls}>
        <Pressable
          style={[styles.ctrlBtn, index === 0 && styles.ctrlDisabled]}
          onPress={goPrev}
          disabled={index === 0}
        >
          <Text style={styles.ctrlText}>⏮ Prev</Text>
        </Pressable>
        <Pressable
          style={[styles.ctrlBtnMain, !ready && styles.ctrlDisabled]}
          onPress={() => void replay()}
          disabled={!ready}
        >
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f14",
  },
  playerWrap: { position: "relative", height: 220, backgroundColor: "#000" },
  playerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000cc",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playerOverlayText: { color: "#aaa", fontSize: 13 },
  playerErrorText: {
    color: "#ff6b6b",
    fontSize: 13,
    paddingHorizontal: 16,
    textAlign: "center",
  },
  progress: {
    color: "#888",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hint: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
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
