import type { YouTubePlayerHandle } from "@/src/components/YouTubePlayer";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** getCurrentTime с таймаутом — на Android bridge часто зависает и блокирует watcher. */
export async function fetchBridgeTime(
  player: YouTubePlayerHandle | null | undefined,
  chunkStart: number,
  timeoutMs = 120,
): Promise<number> {
  if (!player) return 0;
  try {
    const t = await Promise.race([
      player.getCurrentTime(),
      delay(timeoutMs).then(() => Number.NaN),
    ]);
    if (typeof t === "number" && !Number.isNaN(t) && t > chunkStart - 0.5) {
      return t;
    }
  } catch {
    /* ignore */
  }
  return 0;
}
