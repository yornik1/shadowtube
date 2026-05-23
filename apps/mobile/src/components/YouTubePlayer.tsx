import { useRef, forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet, Platform } from "react-native";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";

export type YouTubePlayerState =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "video cued";

export type YouTubePlayerHandle = {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => Promise<number>;
};

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

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
      },
      getCurrentTime: async () => {
        const t = await playerRef.current?.getCurrentTime();
        return typeof t === "number" ? t : 0;
      },
    }));

    return (
      <View style={styles.wrap}>
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={220}
          play={playing}
          videoId={videoId}
          forceAndroidAutoplay={Platform.OS === "android"}
          onReady={onReady}
          onError={onError}
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
        {/* блокер всегда виден: иначе тап по iframe запускает плеер вручную и состояние уезжает */}
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
