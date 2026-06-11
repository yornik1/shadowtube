import type { Chunk } from "@shadowtube/shared";
import { CAPTION_TRIM_MS } from "./sessionConstants";

export function effectiveEnd(c: Chunk, next?: Chunk): number {
  if (!next) return c.end;
  return Math.min(c.end, next.start);
}

export function computeEndSec(
  c: Chunk,
  next: Chunk | undefined,
  captionTrimMs = CAPTION_TRIM_MS,
): number {
  const raw = effectiveEnd(c, next) - captionTrimMs / 1000;
  // next.start может быть < c.end (overlap) — не допускаем endSec < start
  return Math.max(raw, c.start + 0.3);
}

export function computeDurationMs(endSec: number, chunkStart: number): number {
  return Math.max((endSec - chunkStart) * 1000, 300);
}

export function computeBridgeOk(
  bridgeT: number,
  chunkStart: number,
  wallPos: number,
): boolean {
  return bridgeT >= chunkStart - 0.2 && bridgeT <= wallPos + 1.5;
}

export function computePlaybackPosition(
  wallPos: number,
  bridgeT: number,
  chunkStart: number,
): { pos: number; bridgeOk: boolean } {
  const bridgeOk = computeBridgeOk(bridgeT, chunkStart, wallPos);
  const pos = bridgeOk ? Math.max(wallPos, bridgeT) : wallPos;
  return { pos, bridgeOk };
}

export function shouldStopPlayback(
  pos: number,
  endSec: number,
  elapsed: number,
  durationMs: number,
): boolean {
  return pos >= endSec - 0.05 || elapsed >= durationMs + 400;
}
