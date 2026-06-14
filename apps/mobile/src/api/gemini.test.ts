import { afterEach, describe, expect, it, vi } from "vitest";

import { translateWord } from "./gemini";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function geminiText(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("gemini translations", () => {
  it("falls back to single-word translation when batch response is not JSON", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(init?.body ?? ""));
      if (calls.length === 1) return geminiText("ускоренный");
      return geminiText("ускоренный");
    });

    const result = await translateWord(
      "test-key",
      "accelerated",
      "The problem can be accelerated by one GPU.",
      "gemini-test",
    );

    expect(result.translation).toBe("ускоренный");
    expect(calls.length).toBeGreaterThan(1);
  });

  it("parses fenced single-word JSON", async () => {
    globalThis.fetch = vi.fn(async () =>
      geminiText('```json\n{"translation":"ускоренный","partOfSpeech":"verb"}\n```'),
    );

    const result = await translateWord(
      "test-key",
      "accelerated",
      "accelerated",
      "gemini-test",
    );

    expect(result.translation).toBe("ускоренный");
  });
});
