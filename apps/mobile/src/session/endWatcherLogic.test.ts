import { describe, it, expect } from "vitest";
import {
  computePlaybackPosition,
  shouldStopPlayback,
  computeEndSec,
  computeDurationMs,
  effectiveEnd,
} from "./endWatcherLogic";
import type { Chunk } from "@shadowtube/shared";

describe("effectiveEnd", () => {
  it("uses min of chunk end and next start", () => {
    const c: Chunk = { start: 0, end: 5, text: "a" };
    const next: Chunk = { start: 4.5, end: 8, text: "b" };
    expect(effectiveEnd(c, next)).toBe(4.5);
  });
});

describe("computePlaybackPosition", () => {
  it("uses wall-clock when bridge stuck below chunk start", () => {
    const { pos, bridgeOk } = computePlaybackPosition(72.5, 71.0, 72.0);
    expect(bridgeOk).toBe(false);
    expect(pos).toBe(72.5);
  });

  it("uses max of wall and bridge when bridge is valid", () => {
    const { pos, bridgeOk } = computePlaybackPosition(72.3, 72.1, 72.0);
    expect(bridgeOk).toBe(true);
    expect(pos).toBe(72.3);
  });

  it("rejects bridge stuck well before chunk start", () => {
    const { pos, bridgeOk } = computePlaybackPosition(73.2, 71.0, 73.0);
    expect(bridgeOk).toBe(false);
    expect(pos).toBe(73.2);
  });
});

describe("shouldStopPlayback", () => {
  const endSec = 4.75;
  const durationMs = 4750;

  it("stops when pos reaches endSec threshold", () => {
    expect(shouldStopPlayback(4.71, endSec, 4000, durationMs)).toBe(true);
  });

  it("does not stop before threshold", () => {
    expect(shouldStopPlayback(4.5, endSec, 4000, durationMs)).toBe(false);
  });

  it("stops on elapsed fallback", () => {
    expect(shouldStopPlayback(4.0, endSec, durationMs + 400, durationMs)).toBe(
      true,
    );
  });
});

describe("pause test fixtures timing", () => {
  it("clamps endSec when next chunk overlaps (endSec >= start + 0.3)", () => {
    const c: Chunk = { start: 61.22, end: 65.02, text: "a" };
    const next: Chunk = { start: 61.0, end: 70, text: "b" };
    const endSec = computeEndSec(c, next);
    expect(endSec).toBeGreaterThanOrEqual(c.start + 0.3);
  });

  it("first dev chunk window matches e2e script expectations", () => {
    const chunks: Chunk[] = [
      { start: 0, end: 5, text: "one" },
      { start: 5, end: 10, text: "two" },
    ];
    const endSec = computeEndSec(chunks[0]!, chunks[1]);
    const durationMs = computeDurationMs(endSec, chunks[0]!.start);
    expect(endSec).toBeCloseTo(4.75, 2);
    expect(durationMs).toBe(4750);
  });
});
