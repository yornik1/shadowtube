import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchDirectMetadata,
  fetchDirectTranscript,
  parseJson3Transcript,
  selectCaptionTrack,
} from "./youtubeCaptions";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("youtube captions direct client", () => {
  it("parses json3 timedtext events into transcript segments", () => {
    const segments = parseJson3Transcript({
      events: [
        { tStartMs: 1000, dDurationMs: 1200, segs: [{ utf8: "Hello" }, { utf8: " " }, { utf8: "world" }] },
        { tStartMs: 2400, dDurationMs: 800, segs: [{ utf8: "\n" }] },
        { tStartMs: 3500, dDurationMs: 1500, segs: [{ utf8: "Again" }] },
      ],
    });

    expect(segments).toEqual([
      { start: 1, duration: 1.2, text: "Hello world" },
      { start: 3.5, duration: 1.5, text: "Again" },
    ]);
  });

  it("prefers exact non-ASR language track, then ASR exact language", () => {
    const manual = { languageCode: "en", baseUrl: "https://www.youtube.com/api/timedtext?manual=1" };
    const asr = { languageCode: "en", kind: "asr", baseUrl: "https://www.youtube.com/api/timedtext?asr=1" };
    const translated = { languageCode: "ru", baseUrl: "https://www.youtube.com/api/timedtext?ru=1" };

    expect(selectCaptionTrack([translated, asr, manual], "en")).toBe(manual);
    expect(selectCaptionTrack([translated, asr], "en")).toBe(asr);
  });

  it("fetches InnerTube player, timedtext json3, and maps metadata", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      calls.push(url);
      if (url.includes("/youtubei/v1/player")) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: "OK" },
            videoDetails: {
              title: "Direct video",
              author: "Direct channel",
              lengthSeconds: "42",
              thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/abc/hqdefault.jpg" }] },
            },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  {
                    languageCode: "en",
                    baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      expect(url).toContain("fmt=json3");
      return new Response(
        JSON.stringify({
          events: [{ tStartMs: 500, dDurationMs: 1000, segs: [{ utf8: "Hi" }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await expect(fetchDirectTranscript("abc", "en")).resolves.toEqual({
      segments: [{ start: 0.5, duration: 1, text: "Hi" }],
      hasManualCaptions: true,
      language: "en",
    });
    await expect(fetchDirectMetadata("abc")).resolves.toEqual({
      title: "Direct video",
      channel: "Direct channel",
      durationSec: 42,
      thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    });

    expect(calls.filter((url) => url.includes("/youtubei/v1/player"))).toHaveLength(2);
  });

  it("reports YouTube login-required separately from missing captions", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          playabilityStatus: {
            status: "LOGIN_REQUIRED",
            reason: "Sign in to confirm you’re not a bot",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchDirectTranscript("blocked", "en")).rejects.toThrow(
      "YouTube требует вход",
    );
  });
});
