import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

vi.mock("@/src/secure/keychain", () => ({
  getProxyUrlOverride: vi.fn(async () => null),
}));

vi.mock("./youtubeCaptions", () => ({
  fetchDirectMetadata: vi.fn(),
  fetchDirectTranscript: vi.fn(),
}));

import { fetchDirectMetadata, fetchDirectTranscript } from "./youtubeCaptions";
import { fetchMetadata, fetchTranscript } from "./transcript";
import { PROD_PROXY_IP_URL, PROD_PROXY_URL } from "./proxyConfig";

const originalFetch = globalThis.fetch;
const mockedDirectMetadata = vi.mocked(fetchDirectMetadata);
const mockedDirectTranscript = vi.mocked(fetchDirectTranscript);

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("transcript api", () => {
  it("uses direct YouTube captions before proxy for transcripts", async () => {
    mockedDirectTranscript.mockResolvedValueOnce({
      segments: [{ start: 0, duration: 1, text: "Direct" }],
      hasManualCaptions: true,
      language: "en",
    });
    globalThis.fetch = vi.fn();

    const transcript = await fetchTranscript("abc123", "en");

    expect(transcript.segments[0]?.text).toBe("Direct");
    expect(mockedDirectTranscript).toHaveBeenCalledWith("abc123", "en");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("uses direct YouTube player metadata before proxy", async () => {
    mockedDirectMetadata.mockResolvedValueOnce({
      title: "Direct video",
      channel: "Direct channel",
      durationSec: 42,
      thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
    });
    globalThis.fetch = vi.fn();

    const meta = await fetchMetadata("abc123");

    expect(meta.title).toBe("Direct video");
    expect(mockedDirectMetadata).toHaveBeenCalledWith("abc123");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("falls back from direct metadata to AWS DNS and raw IP proxy when network fails", async () => {
    mockedDirectMetadata.mockRejectedValueOnce(new Error("direct blocked"));
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      calls.push(url);
      if (url.startsWith(PROD_PROXY_URL)) {
        throw new TypeError("Network request failed");
      }
      return new Response(
        JSON.stringify({
          title: "Video",
          channel: "Channel",
          durationSec: 10,
          thumbnail: "https://example.com/t.jpg",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const meta = await fetchMetadata("abc123");

    expect(meta.title).toBe("Video");
    expect(calls[0]).toContain(PROD_PROXY_URL);
    expect(calls[1]).toContain(PROD_PROXY_IP_URL);
  });

  it("does not report a reachable proxy HTTP error as proxy unreachable after direct fallback", async () => {
    mockedDirectTranscript.mockRejectedValueOnce(new Error("direct blocked"));
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(input.toString());
      return new Response(
        JSON.stringify({
          error:
            "[YoutubeTranscript] 🚨 Transcript is disabled on this video (vif8NQcjVf0)",
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    });

    await expect(fetchTranscript("vif8NQcjVf0")).rejects.toThrow(
      "У этого видео отключены или недоступны английские субтитры",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(PROD_PROXY_URL);
  });
});
