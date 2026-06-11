import type { Chunk } from "@shadowtube/shared";
import {
  computeDurationMs,
  computeEndSec,
} from "./endWatcherLogic";

/** Official YouTube embed helper — короткое, embed-friendly. */
export const PAUSE_TEST_VIDEO_ID = "M7lc1UVf-VE";

export const PAUSE_TEST_CHUNKS: Chunk[] = [
  { start: 0, end: 5, text: "E2E chunk one." },
  { start: 5, end: 10, text: "E2E chunk two." },
];

/** Ожидаемое окно elapsed (ms) для watcher_stop после replay первого чанка. */
export function expectedPauseWindowMs(chunkIndex = 0): {
  minMs: number;
  maxMs: number;
  durationMs: number;
} {
  const c = PAUSE_TEST_CHUNKS[chunkIndex];
  if (!c) throw new Error(`No chunk at index ${chunkIndex}`);
  const next = PAUSE_TEST_CHUNKS[chunkIndex + 1];
  const endSec = computeEndSec(c, next);
  const durationMs = computeDurationMs(endSec, c.start);
  return {
    durationMs,
    minMs: durationMs - 800,
    maxMs: durationMs + 2500,
  };
}
