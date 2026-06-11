import { useRef, forwardRef, useImperativeHandle, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";

export type YouTubePlayerState =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "video cued";

export type YouTubePlayerHandle = {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => Promise<number>;
  /** Android: pulse pauseVideo после seek — play=false alone часто не останавливает iframe. */
  stopAt: (seconds: number) => void;
  /** Только pulse паузы без seekTo — для ретраев, когда seek уже был.
   *  @param delayMs опциональная задержка перед pulse (мс, default 0) */
  pulsePause: (delayMs?: number) => void;
};

export function formatYouTubeError(code: string | undefined): string | null {
  if (!code || code === "undefined") return null;
  switch (code) {
    case "embed_not_allowed":
      return "Владелец запретил встраивание (101/150)";
    case "video_not_found":
      return "Видео не найдено (100)";
    case "HTML5_error":
      return "Ошибка HTML5-плеера (5)";
    case "invalid_parameter":
      return "Неверные параметры (2)";
    default:
      return `YouTube: ${code}`;
  }
}

type Props = {
  videoId: string;
  playing: boolean;
  onReady?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: YouTubePlayerState) => void;
};

export const YouTubePlayerView = forwardRef<YouTubePlayerHandle, Props>(
  function YouTubePlayerView(
    { videoId, playing, onReady, onError, onStateChange },
    ref,
  ) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    /** null = следовать prop playing; иначе override для pulse pause на Android. */
    const [playOverride, setPlayOverride] = useState<boolean | null>(null);
    const stopTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const { width: screenW } = useWindowDimensions();
    const playerW = Math.max(Math.round(screenW), 320);
    const playerH = Math.max(Math.round((playerW * 9) / 16), 180);

    const playProp = playOverride !== null ? playOverride : playing;

    useEffect(() => {
      if (playing && playOverride !== null) {
        setPlayOverride(null);
      }
    }, [playing, playOverride]);

    useEffect(() => {
      return () => {
        stopTimersRef.current.forEach(clearTimeout);
        stopTimersRef.current = [];
      };
    }, []);

    const firePausePulse = (delayMs = 0) => {
      // Pulse play→pause чтобы react-native-youtube-iframe отправил pauseVideo
      // (если play уже false, useEffect библиотеки не шлёт pause повторно)
      stopTimersRef.current.forEach(clearTimeout);
      stopTimersRef.current = [];
      const schedule = (fn: () => void, ms: number) => {
        stopTimersRef.current.push(setTimeout(fn, delayMs + ms));
      };
      schedule(() => setPlayOverride(true), 0);
      schedule(() => setPlayOverride(false), 40);
      schedule(() => setPlayOverride(null), 100);
    };

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number, allowSeekAhead = true) => {
        playerRef.current?.seekTo(seconds, allowSeekAhead);
      },
      getCurrentTime: async () => {
        const t = await playerRef.current?.getCurrentTime();
        return typeof t === "number" ? t : 0;
      },
      stopAt: (_seconds: number) => {
        // Пауза придёт от setPlaying(false) вызывающего кода (play=true→false → pauseVideo).
        // Seek выполняется ПОСЛЕ подтверждения паузы (onStateChange=paused) через seekAfterPauseRef.
        // НЕ seekTo здесь: seek в небуферизованную позицию во время pause → buffering → pauseVideo игнорируется.
      },
      pulsePause: (delayMs = 0) => {
        // Для ретраев когда play уже false — нужен toggle true→false чтобы lib послал pauseVideo
        firePausePulse(delayMs);
      },
    }));

    return (
      <View style={[styles.wrap, { height: playerH }]}>
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={playerH}
          width={playerW}
          play={playProp}
          videoId={videoId}
          mute={false}
          volume={100}
          forceAndroidAutoplay={Platform.OS === "android"}
          onReady={onReady}
          onError={(code: string) => {
            const msg = formatYouTubeError(code);
            if (msg) onError?.(msg);
          }}
          onChangeState={onStateChange}
          initialPlayerParams={{
            controls: 0,
            preventFullScreen: false,
            rel: false,
          }}
          webViewProps={{
            androidLayerType: "none",
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
          }}
        />
        <View style={styles.blocker} pointerEvents="box-only" />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: "#000", position: "relative" },
  blocker: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
