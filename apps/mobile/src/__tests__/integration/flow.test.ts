/**
 * Integration test: transcript fetch → chunk pipeline.
 *
 * Tests the full mobile data pipeline (proxy → transcript → chunker)
 * without a device or SQLite.
 *
 * Requirements: proxy running at PROXY_URL (default http://localhost:8787)
 * These tests are skipped automatically when the proxy is unreachable.
 *
 * Run:
 *   pnpm test                                         # skipped if proxy down
 *   PROXY_URL=http://localhost:8787 pnpm test         # explicit proxy URL
 */
import { describe, it, expect } from "vitest";
import { chunk } from "@/src/chunking/chunker";
import type { TranscriptSegment, TranscriptResponse } from "@shadowtube/shared";

const PROXY_URL = process.env.PROXY_URL ?? "http://localhost:8787";

// Rick Astley — public, stable ID, always has EN captions.
// NOTE: It's a song — lyrics have no sentence punctuation and no pauses,
// so the chunker correctly returns few large chunks (not many small ones).
// We use it to test the API contract, not chunking quality.
const TEST_VIDEO_ID = "dQw4w9WgXcQ";

async function proxyReachable(): Promise<boolean> {
  try {
    const res = await fetch(PROXY_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe.skipIf(!(await proxyReachable()))(
  "transcript → chunk flow (integration, requires proxy)",
  () => {
    it("proxy /transcript returns valid segment array", async () => {
      const res = await fetch(
        `${PROXY_URL}/transcript?videoId=${TEST_VIDEO_ID}&lang=en`,
        { signal: AbortSignal.timeout(20_000) },
      );
      expect(res.ok, `proxy /transcript returned ${res.status}`).toBe(true);

      const data = (await res.json()) as TranscriptResponse;
      expect(Array.isArray(data.segments)).toBe(true);
      expect(data.segments.length).toBeGreaterThan(0);
      expect(data.language).toBe("en");

      const first = data.segments[0]!;
      expect(typeof first.start).toBe("number");
      expect(typeof first.duration).toBe("number");
      expect(typeof first.text).toBe("string");
      expect(first.text.length).toBeGreaterThan(0);
    });

    it("chunker produces at least 1 chunk from real transcript", async () => {
      const res = await fetch(
        `${PROXY_URL}/transcript?videoId=${TEST_VIDEO_ID}&lang=en`,
        { signal: AbortSignal.timeout(20_000) },
      );
      const data = (await res.json()) as TranscriptResponse;
      const chunks = chunk(data.segments);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => c.end > c.start)).toBe(true);
      expect(chunks.every((c) => c.text.trim().length > 0)).toBe(true);
    });

    it("chunks do not overlap", async () => {
      const res = await fetch(
        `${PROXY_URL}/transcript?videoId=${TEST_VIDEO_ID}&lang=en`,
        { signal: AbortSignal.timeout(20_000) },
      );
      const data = (await res.json()) as TranscriptResponse;
      const chunks = chunk(data.segments);

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i]!.start).toBeGreaterThanOrEqual(chunks[i - 1]!.end - 0.01);
      }
    });

    it("proxy /metadata returns expected shape", async () => {
      const res = await fetch(
        `${PROXY_URL}/metadata?videoId=${TEST_VIDEO_ID}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      expect(res.ok).toBe(true);

      const meta = (await res.json()) as {
        title: string;
        channel: string;
        durationSec: number;
        thumbnail: string;
      };

      expect(meta.title).toBeTruthy();
      expect(meta.channel).toBeTruthy();
      expect(meta.durationSec).toBeGreaterThan(0);
      expect(meta.thumbnail).toMatch(/^https?:\/\//);
    });
  },
);

// ---------------------------------------------------------------------------
// Chunker quality test with realistic speech segments (no proxy needed)
// ---------------------------------------------------------------------------

describe("chunker quality (unit)", () => {
  const speechSegments: TranscriptSegment[] = [
    { start: 0.0, duration: 2.1, text: "Welcome to today's tutorial." },
    { start: 2.5, duration: 1.8, text: "Today we'll learn about chunking." },
    { start: 5.0, duration: 1.5, text: "First, let's look at sentences." },
    { start: 7.0, duration: 1.2, text: "A sentence ends with punctuation." },
    { start: 9.0, duration: 1.8, text: "Then we move to the next one." },
    { start: 12.0, duration: 1.5, text: "Pauses also create boundaries." },
    { start: 14.0, duration: 1.2, text: "This is how the chunker works." },
  ];

  it("speech segments produce multiple chunks", () => {
    const chunks = chunk(speechSegments);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("chunks cover entire transcript duration", () => {
    const chunks = chunk(speechSegments);
    const totalEnd = speechSegments.at(-1)!.start + speechSegments.at(-1)!.duration;
    expect(chunks.at(-1)!.end).toBeGreaterThanOrEqual(totalEnd - 0.1);
  });

  it("no chunk has empty text", () => {
    const chunks = chunk(speechSegments);
    expect(chunks.every((c) => c.text.trim().length > 0)).toBe(true);
  });
});
