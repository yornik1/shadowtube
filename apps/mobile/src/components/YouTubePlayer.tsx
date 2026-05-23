import { useRef, forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet } from "react-native";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";

export type YouTubePlayerHandle = {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => Promise<number>;
};

type Props = {
  videoId: string;
  playing: boolean;
  onReady?: () => void;
};

export const YouTubePlayerView = forwardRef<YouTubePlayerHandle, Props>(
  function YouTubePlayerView({ videoId, playing, onReady }, ref) {
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
          ref={playerRef}
          height={200}
          play={playing}
          videoId={videoId}
          onReady={onReady}
          webViewProps={{
            androidLayerType: "hardware",
          }}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: "#000" },
});
