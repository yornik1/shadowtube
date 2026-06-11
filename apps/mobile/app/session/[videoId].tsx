import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SessionScreenContent } from "@/src/session/SessionScreenContent";
import {
  getChunksForVideo,
  getVideo,
  touchVideo,
} from "@/src/db/repos/videos";
import { getSession, updateSessionProgress } from "@/src/db/repos/sessions";
import type { Chunk } from "@shadowtube/shared";

export default function SessionScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

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
  }, [videoId]);

  useEffect(() => {
    if (!videoId || chunks.length === 0) return;
    updateSessionProgress(videoId, index);
  }, [videoId, index, chunks.length]);

  if (loading || !videoId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7eb8ff" />
      </View>
    );
  }

  return (
    <SessionScreenContent
      videoId={videoId}
      chunks={chunks}
      title={title}
      initialChunkIndex={index}
      onChunkChange={setIndex}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f14",
  },
});
