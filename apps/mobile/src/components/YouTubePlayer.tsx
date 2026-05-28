import { useRef, forwardRef, useImperativeHandle } from "react";
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
    const { width: screenW } = useWindowDimensions();
    const playerW = Math.max(Math.round(screenW), 320);
    const playerH = Math.max(Math.round((playerW * 9) / 16), 180);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number, allowSeekAhead = true) => {
        playerRef.current?.seekTo(seconds, allowSeekAhead);
      },
      getCurrentTime: async () => {
        const t = await playerRef.current?.getCurrentTime();
        return typeof t === "number" ? t : 0;
      },
    }));

    return (
      <View style={[styles.wrap, { height: playerH }]}>
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={playerH}
          width={playerW}
          play={playing}
          videoId={videoId}
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
