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

import { fetchMetadata } from "./transcript";
import { PROD_PROXY_IP_URL, PROD_PROXY_URL } from "./proxyConfig";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("transcript api", () => {
  it("falls back from AWS DNS host to raw IP host when fetch fails", async () => {
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
});
