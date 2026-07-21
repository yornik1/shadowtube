import { afterEach, describe, expect, it, vi } from "vitest";

import { translateChunk, translatePhrase } from "./gemini";

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

function apiError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Уникальный контекст на каждый тест — кэш переводов живёт в модуле. */
let ctxCounter = 0;
function uniqueContext(text: string): string {
  ctxCounter += 1;
  return `${text} #${ctxCounter}`;
}

describe("translatePhrase", () => {
  it("translates the fragment as a whole and returns an English definition", async () => {
    const bodies: string[] = [];
    globalThis.fetch = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return geminiText(
        JSON.stringify({
          ru: "выйти сухим из воды",
          definitionEn: "to avoid punishment",
          kind: "idiom",
        }),
      );
    });

    const r = await translatePhrase(
      "test-key",
      "get away with",
      uniqueContext("You can't get away with that."),
      "gemini-test",
    );

    expect(r.ru).toBe("выйти сухим из воды");
    expect(r.definitionEn).toBe("to avoid punishment");
    expect(r.kind).toBe("idiom");
    // Контекст всего предложения обязан уехать в модель — иначе идиома развалится.
    expect(bodies[0]).toContain("get away with");
    expect(bodies[0]).toContain("You can't get away with that.");
  });

  it("caches by fragment + context and does not call the API twice", async () => {
    const fetchMock = vi.fn(async () =>
      geminiText(JSON.stringify({ ru: "на самом деле", definitionEn: "in reality" })),
    );
    globalThis.fetch = fetchMock;

    const ctx = uniqueContext("In fact, it works.");
    await translatePhrase("test-key", "in fact", ctx, "gemini-test");
    await translatePhrase("test-key", "in fact", ctx, "gemini-test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent requests for the same fragment", async () => {
    const fetchMock = vi.fn(async () =>
      geminiText(JSON.stringify({ ru: "поехали", definitionEn: "let's start" })),
    );
    globalThis.fetch = fetchMock;

    const ctx = uniqueContext("Let's go.");
    await Promise.all([
      translatePhrase("test-key", "let's go", ctx, "gemini-test"),
      translatePhrase("test-key", "let's go", ctx, "gemini-test"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model on 404", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) return apiError(404, "model not found");
      return geminiText(JSON.stringify({ ru: "привет", definitionEn: "a greeting" }));
    });

    const r = await translatePhrase(
      "test-key",
      "hello",
      uniqueContext("Hello there."),
      "missing-model",
    );

    expect(r.ru).toBe("привет");
    expect(call).toBe(2);
  });

  it("does not retry on a non-retryable status", async () => {
    const fetchMock = vi.fn(async () => apiError(400, "API key not valid"));
    globalThis.fetch = fetchMock;

    await expect(
      translatePhrase("bad-key", "hello", uniqueContext("Hello."), "gemini-test"),
    ).rejects.toThrow(/API key not valid/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives a model that answers with plain text instead of JSON", async () => {
    globalThis.fetch = vi.fn(async () => geminiText("выйти сухим из воды"));

    const r = await translatePhrase(
      "test-key",
      "get away with",
      uniqueContext("He got away with it."),
      "gemini-test",
    );

    expect(r.ru).toBe("выйти сухим из воды");
    expect(r.definitionEn).toBe("");
  });

  it("rejects an empty fragment", async () => {
    await expect(
      translatePhrase("test-key", "   ", "context", "gemini-test"),
    ).rejects.toThrow();
  });
});

describe("translateChunk", () => {
  it("returns the full translation with idiom notes", async () => {
    globalThis.fetch = vi.fn(async () =>
      geminiText(
        JSON.stringify({
          ru: "Ему это сошло с рук.",
          notes: [{ span: "got away with", ru: "сошло с рук", kind: "idiom" }],
        }),
      ),
    );

    const r = await translateChunk(
      "test-key",
      uniqueContext("He got away with it."),
      "gemini-test",
    );

    expect(r.ru).toBe("Ему это сошло с рук.");
    expect(r.notes).toHaveLength(1);
  });

  it("caches the chunk translation", async () => {
    const fetchMock = vi.fn(async () =>
      geminiText(JSON.stringify({ ru: "Перевод", notes: [] })),
    );
    globalThis.fetch = fetchMock;

    const ctx = uniqueContext("Some sentence.");
    await translateChunk("test-key", ctx, "gemini-test");
    await translateChunk("test-key", ctx, "gemini-test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
