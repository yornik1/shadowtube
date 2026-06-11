import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import {
  YouTubePlayerView,
  type YouTubePlayerHandle,
} from "@/src/components/YouTubePlayer";
import { TranscriptView } from "@/src/components/TranscriptView";
import { TranslationSheet } from "@/src/components/TranslationSheet";
import { useSettingsStore } from "@/src/store/settings";
import { prefetchChunkTranslations } from "@/src/api/gemini";
import { dlog } from "@/src/utils/devLog";
import { e2eEvent } from "@/src/session/e2eLog";
import { fetchBridgeTime } from "@/src/session/bridgeTime";
import {
  computeDurationMs,
  computeEndSec,
  computePlaybackPosition,
  effectiveEnd,
  shouldStopPlayback,
} from "@/src/session/endWatcherLogic";
import { SEEK_SETTLE_MS, TICK_MS } from "@/src/session/sessionConstants";
import { getDevProxyUrl } from "@/src/utils/proxyUrl";
import type { Chunk } from "@shadowtube/shared";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(() => r(), ms));
}

export type SessionScreenContentProps = {
  videoId: string;
  chunks: Chunk[];
  title?: string;
  initialChunkIndex?: number;
  /** Вызывается при каждой смене чанка (навигация prev/next/goToChunk). */
  onChunkChange?: (idx: number) => void;
  /** Dev E2E: auto replay через 2s после onReady (один раз). */
  autoReplayOnReady?: boolean;
  /** Dev E2E: баннер статуса на экране. */
  showE2eStatus?: boolean;
  /** Dev E2E: фиксированные чанки M7lc1UVf-VE (автотест). */
  e2eUsesFixtures?: boolean;
};

export function SessionScreenContent({
  videoId,
  chunks,
  title = "",
  initialChunkIndex = 0,
  onChunkChange,
  autoReplayOnReady = false,
  showE2eStatus = false,
  e2eUsesFixtures = false,
}: SessionScreenContentProps) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const endWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayGenRef = useRef(0);
  const readyOnceRef = useRef(false);
  const autoReplayDoneRef = useRef(false);
  const lastPlayerStateRef = useRef<string>("unstarted");
  const pauseConfirmTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Ненулевое значение = ждём паузы для этого gen; при playing → сразу pulsePause. */
  const pendingPauseGenRef = useRef<number>(0);

  const [index, setIndex] = useState(
    Math.min(initialChunkIndex, Math.max(0, chunks.length - 1)),
  );
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState("");
  const [selectedContext, setSelectedContext] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [e2eStatus, setE2eStatus] = useState("ожидание плеера…");

  const setE2e = useCallback(
    (line: string) => {
      if (showE2eStatus) setE2eStatus(line);
    },
    [showE2eStatus],
  );

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

  const cancelPauseConfirmTimers = useCallback(() => {
    pauseConfirmTimersRef.current.forEach(clearTimeout);
    pauseConfirmTimersRef.current = [];
  }, []);

  /**
   * Пауза без seek — pause сначала, seek после подтверждения.
   * attempt=0: пауза придёт от setPlaying(false) (play=true→false → lib посылает pauseVideo).
   * attempt≥1: pulsePause (toggle play=true→false через playOverride когда play уже false).
   * Seek выполняется в onStateChange=paused через seekAfterPauseRef.
   */
  const stopWithConfirm = useCallback(
    (gen: number, seconds: number, attempt = 0) => {
      if (gen !== replayGenRef.current) return;
      if (attempt > 0) {
        // play уже false — нужен toggle true→false чтобы lib заново послал pauseVideo
        playerRef.current?.pulsePause();
      }
      // attempt=0: пауза уже в пути от setPlaying(false) → не нужно дополнительных вызовов
      cancelPauseConfirmTimers();
      pendingPauseGenRef.current = gen;
      const t = setTimeout(() => {
        if (gen !== replayGenRef.current) return;
        if (lastPlayerStateRef.current === "paused") return;
        if (attempt < 2) {
          dlog(
            "pause_confirm",
            `retry gen=${gen} attempt=${attempt + 1} state=${lastPlayerStateRef.current}`,
          );
          e2eEvent("pause_retry", { gen, attempt: attempt + 1 });
          stopWithConfirm(gen, seconds, attempt + 1);
        } else {
          pendingPauseGenRef.current = 0;
          // Pause не подтвердилась — seekTo чтобы позиция была правильная
          playerRef.current?.seekTo(seconds);
          dlog(
            "pause_confirm",
            `failed gen=${gen} state=${lastPlayerStateRef.current}`,
          );
          e2eEvent("pause_failed", { gen });
        }
      }, 700);
      pauseConfirmTimersRef.current.push(t);
    },
    [cancelPauseConfirmTimers],
  );

  /** Целевая позиция для seekTo после подтверждения паузы. */
  const seekAfterPauseRef = useRef<{ gen: number; seconds: number } | null>(
    null,
  );

  const pauseAt = useCallback(
    (startSec: number) => {
      clearEndWatcher();
      replayGenRef.current += 1;
      const gen = replayGenRef.current;
      e2eEvent("pause_at", { gen, startSec });
      // Всегда seek после паузы — не seekTo до паузы чтобы не вызвать buffering
      seekAfterPauseRef.current = { gen, seconds: startSec };
      setPlaying(false);
      if (ready) stopWithConfirm(gen, startSec);
    },
    [ready, clearEndWatcher, stopWithConfirm],
  );

  const startEndWatcher = useCallback(
    (gen: number, c: Chunk, next: Chunk | undefined, startedAt: number) => {
      clearEndWatcher();
      const endSec = computeEndSec(c, next);
      const durationMs = computeDurationMs(endSec, c.start);
      let tickN = 0;
      let lastBridgeT = 0;

      dlog(
        "watcher",
        `start gen=${gen} start=${c.start.toFixed(2)} endSec=${endSec.toFixed(2)} durMs=${durationMs}`,
      );
      e2eEvent("watcher_start", {
        gen,
        start: c.start,
        endSec,
        durationMs,
      });
      setE2e(`▶ играет 0–${endSec.toFixed(1)}s`);

      endWatcherRef.current = setInterval(() => {
        if (gen !== replayGenRef.current) {
          clearEndWatcher();
          return;
        }

        const elapsed = Date.now() - startedAt;
        const wallPos = c.start + elapsed / 1000;

        // Bridge — fire-and-forget с таймаутом; wall-clock — основной таймер
        void fetchBridgeTime(playerRef.current, c.start).then((t) => {
          if (gen !== replayGenRef.current) return;
          if (t > 0) lastBridgeT = t;
        });

        const { pos, bridgeOk } = computePlaybackPosition(
          wallPos,
          lastBridgeT,
          c.start,
        );

        tickN++;
        if (tickN === 1 || tickN % 7 === 0) {
          dlog(
            "watcher",
            `tick#${tickN} bridge=${lastBridgeT.toFixed(2)} wall=${wallPos.toFixed(2)} pos=${pos.toFixed(2)} end=${endSec.toFixed(2)} elapsed=${elapsed}`,
          );
          e2eEvent("watcher_tick", {
            gen,
            tickN,
            bridgeT: lastBridgeT,
            wallPos,
            pos,
            endSec,
            elapsed,
            bridgeOk,
          });
        }

        if (shouldStopPlayback(pos, endSec, elapsed, durationMs)) {
          dlog(
            "watcher",
            `stop gen=${gen} pos=${pos.toFixed(2)} elapsed=${elapsed}`,
          );
          e2eEvent("watcher_stop", { gen, pos, endSec, elapsed, tickN });
          setE2e(`⏸ СТОП на ${pos.toFixed(1)}s (${elapsed}ms) — должно замереть`);
          clearEndWatcher();
          seekAfterPauseRef.current = { gen, seconds: c.start };
          setPlaying(false);
          stopWithConfirm(gen, c.start);
        }
      }, TICK_MS);
    },
    [clearEndWatcher, setE2e, stopWithConfirm],
  );

  useEffect(() => {
    return () => {
      clearEndWatcher();
      cancelPauseConfirmTimers();
    };
  }, [clearEndWatcher, cancelPauseConfirmTimers]);

  useEffect(() => {
    if (!geminiKey || !current?.text) return;
    prefetchChunkTranslations(geminiKey, current.text, geminiModel);
  }, [geminiKey, geminiModel, current?.text]);

  const playChunkAt = useCallback(
    async (idx: number) => {
      const c = chunks[idx];
      const next = chunks[idx + 1];
      if (!c || !ready) {
        e2eEvent("replay_rejected", { ready, hasCurrent: !!c });
        return;
      }
      const gen = ++replayGenRef.current;
      dlog(
        "replay",
        `gen=${gen} chunk=${idx} start=${c.start.toFixed(2)} end=${c.end.toFixed(2)}`,
      );
      e2eEvent("replay_start", {
        gen,
        chunkIdx: idx,
        start: c.start,
        end: c.end,
      });
      setE2e("🔁 Replay…");
      clearEndWatcher();
      setPlaying(false);
      await delay(80);
      if (gen !== replayGenRef.current) return;

      playerRef.current?.seekTo(c.start);
      await delay(SEEK_SETTLE_MS);
      if (gen !== replayGenRef.current) return;

      setPlaying(true);
      startEndWatcher(gen, c, next, Date.now());
    },
    [chunks, ready, clearEndWatcher, startEndWatcher, setE2e],
  );

  const replay = useCallback(
    () => playChunkAt(index),
    [playChunkAt, index],
  );

  useEffect(() => {
    if (!autoReplayOnReady || !ready || autoReplayDoneRef.current) return;
    autoReplayDoneRef.current = true;
    const t = setTimeout(() => {
      void replay();
    }, 2000);
    return () => clearTimeout(t);
  }, [autoReplayOnReady, ready, replay]);

  const goToChunk = (newIndex: number) => {
    const c = chunks[newIndex];
    if (!c) return;
    e2eEvent("chunk_change", { from: index, to: newIndex });
    setIndex(newIndex);
    onChunkChange?.(newIndex);
    void playChunkAt(newIndex);
  };

  const goPrev = () => {
    if (index > 0) goToChunk(index - 1);
  };

  const goNext = () => {
    if (index < chunks.length - 1) goToChunk(index + 1);
  };

  const handleWordPress = (word: string, context: string) => {
    if (!word || !current) return;
    e2eEvent("btn", { btn: "word", idx: index });
    setSelectedWord(word);
    setSelectedContext(context);
    setSheetVisible(true);
    pauseAt(current.start);
  };

  const handleSheetClose = () => {
    e2eEvent("btn", { btn: "sheet_close", idx: index });
    setSheetVisible(false);
    if (current) pauseAt(current.start);
  };

  if (!current) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Нет чанков</Text>
      </View>
    );
  }

  const playEnd = effectiveEnd(current, nextChunk);

  return (
    <View style={styles.container}>
      {showE2eStatus ? (
        <View style={styles.e2eBanner}>
          <Text style={styles.e2eTitle}>E2E pause-test</Text>
          <Text style={styles.e2eStatus}>{e2eStatus}</Text>
          <Text style={styles.e2eProxy} numberOfLines={1}>
            proxy: {getDevProxyUrl()}
          </Text>
          <Text style={styles.e2eHint}>
            {e2eUsesFixtures
              ? "Видео ~5s → должно остановиться. Логи: pnpm e2e:pause"
              : "Своё видео — проверка pause-on-end вручную. Логи: pnpm e2e:pause"}
          </Text>
        </View>
      ) : null}
      <View style={styles.playerWrap}>
        {!ready && !playerError ? (
          <Image
            source={{
              uri: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            }}
            style={styles.playerPoster}
          />
        ) : null}
        <YouTubePlayerView
          ref={playerRef}
          videoId={videoId}
          playing={playing}
          onReady={() => {
            dlog("player", "ready");
            e2eEvent("player_ready", { videoId });
            setE2e("✓ плеер ready → auto-replay через 2s");
            setPlayerError(null);
            setReady(true);
            if (!readyOnceRef.current) {
              readyOnceRef.current = true;
              playerRef.current?.seekTo(current.start);
            }
          }}
          onError={(err) => {
            dlog("player", `error: ${err}`);
            e2eEvent("player_error", { error: err });
            setPlayerError(err);
            pauseAt(current.start);
          }}
          onStateChange={(state) => {
            dlog("player", `state=${state}`);
            e2eEvent("player_state", { state });
            lastPlayerStateRef.current = state;
            if (state === "paused") {
              pendingPauseGenRef.current = 0;
              cancelPauseConfirmTimers();
              // Seek к целевой позиции чанка — ПОСЛЕ паузы, чтобы не мешать pauseVideo
              const sap = seekAfterPauseRef.current;
              if (sap && sap.gen === replayGenRef.current) {
                seekAfterPauseRef.current = null;
                playerRef.current?.seekTo(sap.seconds);
              }
            }
            if (
              state === "playing" &&
              pendingPauseGenRef.current !== 0 &&
              pendingPauseGenRef.current === replayGenRef.current &&
              seekAfterPauseRef.current?.gen === replayGenRef.current
            ) {
              // seekFirst=false путь: плеер перешёл в playing (после предыдущего чанка)
              // пока мы ждём паузы — немедленно пульсируем паузу
              const pg = pendingPauseGenRef.current;
              dlog(
                "pause_confirm",
                `playing-while-pending gen=${pg} → immediate pulsePause`,
              );
              e2eEvent("pause_pulse_on_playing", { gen: pg });
              playerRef.current?.pulsePause();
            }
            if (showE2eStatus && (state === "playing" || state === "paused")) {
              setE2eStatus((prev) => {
                const base = prev.includes("СТОП") ? prev.split(" · ")[0] : prev;
                return `${base} · player: ${state}`;
              });
            }
            if (state === "ended") {
              clearEndWatcher();
              setPlaying(false);
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
            <Text style={styles.playerErrorText}>YouTube: {playerError}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.progress} numberOfLines={2}>
        {title ? `${title} · ` : ""}
        Чанк {index + 1} / {chunks.length}
        {` · ${formatTime(current.start)}–${formatTime(playEnd)}`}
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
          onPress={() => {
            e2eEvent("btn", { btn: "prev", idx: index, ready, playing });
            goPrev();
          }}
          disabled={index === 0}
        >
          <Text style={styles.ctrlText}>⏮ Prev</Text>
        </Pressable>
        <Pressable
          style={[styles.ctrlBtnMain, !ready && styles.ctrlDisabled]}
          onPress={() => {
            e2eEvent("btn", { btn: "replay", idx: index, ready, playing });
            void replay();
          }}
          disabled={!ready}
          accessibilityLabel="Replay"
        >
          <Text style={styles.ctrlTextMain}>🔁 Replay</Text>
        </Pressable>
        <Pressable
          style={[
            styles.ctrlBtn,
            index >= chunks.length - 1 && styles.ctrlDisabled,
          ]}
          onPress={() => {
            e2eEvent("btn", { btn: "next", idx: index, ready, playing });
            goNext();
          }}
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
  emptyText: { color: "#888", fontSize: 16 },
  playerWrap: { position: "relative", width: "100%", backgroundColor: "#000" },
  playerPoster: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
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
  e2eBanner: {
    backgroundColor: "#1a3a1a",
    borderBottomWidth: 2,
    borderBottomColor: "#4ade80",
    padding: 12,
    gap: 4,
  },
  e2eTitle: { color: "#4ade80", fontWeight: "700", fontSize: 14 },
  e2eStatus: { color: "#fff", fontSize: 15, fontWeight: "600" },
  e2eProxy: { color: "#8f8", fontSize: 11, fontFamily: "monospace" },
  e2eHint: { color: "#aaa", fontSize: 11 },
});
