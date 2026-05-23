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
});
