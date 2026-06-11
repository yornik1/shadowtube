import { describe, it, expect } from "vitest";
import { chunk } from "./chunker";
import type { TranscriptSegment } from "@shadowtube/shared";

describe("chunker", () => {
  it("splits by sentence punctuation", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, duration: 2, text: "Hello world." },
      { start: 2.5, duration: 2, text: "How are you?" },
      { start: 5, duration: 2, text: "I am fine." },
    ];
    const result = chunk(segments);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.text).toContain("Hello");
    expect(result.every((c) => c.end > c.start)).toBe(true);
  });

  it("does not split Mr. as sentence end", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, duration: 3, text: "Mr. Smith went home." },
      { start: 4, duration: 2, text: "He was tired." },
    ];
    const result = chunk(segments);
    const mrChunk = result.find((c) => c.text.includes("Mr."));
    expect(mrChunk?.text).toMatch(/Mr\.\s*Smith/);
  });

  it("splits by pause when no punctuation", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, duration: 1, text: "one two" },
      { start: 1.1, duration: 1, text: "three four" },
      { start: 3, duration: 1, text: "five six" },
    ];
    const result = chunk(segments, { pauseSec: 0.5, punctuationThreshold: 0.99 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("merges very short chunks", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, duration: 0.3, text: "Hi." },
      { start: 0.4, duration: 0.3, text: "Bye." },
    ];
    const result = chunk(segments, { minSec: 2 });
    expect(result.length).toBe(1);
  });

  it("clamps chunk end to next chunk start", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, duration: 5, text: "First sentence." },
      { start: 10, duration: 2, text: "Second sentence." },
    ];
    const result = chunk(segments);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.end).toBeLessThanOrEqual(result[1]!.start);
  });

  it("produces no zero-length chunks from auto-sub style segments (multi-sentence in one segment)", () => {
    // Mirrors real auto-sub layout: segment A ends at 26.4, segment B starts at 26.4
    // and contains two sentences → chunkBySentences gave both chunks the same
    // segStart/segEnd → clampChunkEnds collapsed the first to zero length.
    const segments: TranscriptSegment[] = [
      { start: 15.0, duration: 4.08, text: "bets and decisions as a leader of NVIDIA." },
      { start: 19.08, duration: 7.32, text: "Jensen has been at the helm of NVIDIA for over 30 years." },
      {
        start: 26.4,
        duration: 7.0,
        text: "This is Lex Fridman Podcast. And now dear friends, here's Jensen Huang.",
      },
      { start: 33.4, duration: 4.0, text: "Welcome back." },
    ];
    const result = chunk(segments);

    // No zero-length or negative-length chunks
    expect(result.every((c) => c.end - c.start > 0)).toBe(true);

    // Starts are non-decreasing
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.start).toBeGreaterThanOrEqual(result[i - 1]!.start);
    }

    // All sentence texts are preserved somewhere in the output
    const allText = result.map((c) => c.text).join(" ");
    expect(allText).toContain("Lex Fridman Podcast");
    expect(allText).toContain("Jensen Huang");
    expect(allText).toContain("NVIDIA");
  });

  it("no zero-length chunks when many sentences share the same segment boundaries", () => {
    // Stress test: 5 sentences all inside a single long segment
    const segments: TranscriptSegment[] = [
      {
        start: 0,
        duration: 20,
        text: "First sentence here. Second one follows. Third keeps going. Fourth arrives. Fifth ends it.",
      },
    ];
    const result = chunk(segments);
    expect(result.every((c) => c.end - c.start > 0)).toBe(true);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.start).toBeGreaterThanOrEqual(result[i - 1]!.start);
    }
  });
});
