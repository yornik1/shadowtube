import { describe, expect, it } from "vitest";

import {
  buildBatchPrompt,
  buildChunkPrompt,
  buildPhrasePrompt,
  parseBatchResponse,
  parseChunkResponse,
  parsePhraseResponse,
} from "./geminiPrompts";

describe("buildPhrasePrompt", () => {
  it("passes both the fragment and the full sentence as context", () => {
    const prompt = buildPhrasePrompt("get away with", "You can't get away with that here.");
    expect(prompt).toContain("get away with");
    expect(prompt).toContain("You can't get away with that here.");
    expect(prompt).toMatch(/never translate it word by word/i);
  });
});

describe("parsePhraseResponse", () => {
  it("parses a complete JSON answer", () => {
    const r = parsePhraseResponse(
      JSON.stringify({
        ru: "выйти сухим из воды",
        literal: "уйти прочь с",
        definitionEn: "to do something wrong and not be punished",
        note: "Идиома, дословный перевод не работает",
        kind: "idiom",
      }),
      "get away with",
    );

    expect(r.ru).toBe("выйти сухим из воды");
    expect(r.literal).toBe("уйти прочь с");
    expect(r.definitionEn).toBe("to do something wrong and not be punished");
    expect(r.kind).toBe("idiom");
  });

  it("parses JSON wrapped in a code fence", () => {
    const r = parsePhraseResponse(
      '```json\n{"ru":"забить на это","definitionEn":"to stop caring","kind":"phrasal"}\n```',
      "blow it off",
    );
    expect(r.ru).toBe("забить на это");
    expect(r.kind).toBe("phrasal");
  });

  it("falls back to plain text when the model ignores the JSON format", () => {
    const r = parsePhraseResponse("выйти сухим из воды", "get away with");
    expect(r.ru).toBe("выйти сухим из воды");
    expect(r.definitionEn).toBe("");
    expect(r.kind).toBe("plain");
  });

  it("drops a literal translation identical to the natural one", () => {
    const r = parsePhraseResponse(
      JSON.stringify({ ru: "на самом деле", literal: "на самом деле", definitionEn: "in fact" }),
      "in fact",
    );
    expect(r.literal).toBeUndefined();
  });

  it("normalizes an unknown kind to plain", () => {
    const r = parsePhraseResponse(
      JSON.stringify({ ru: "вопрос", definitionEn: "a question", kind: "banana" }),
      "question",
    );
    expect(r.kind).toBe("plain");
  });

  it("accepts the legacy `translation` field name", () => {
    const r = parsePhraseResponse(JSON.stringify({ translation: "вопрос" }), "question");
    expect(r.ru).toBe("вопрос");
  });

  it("throws when there is nothing usable at all", () => {
    expect(() => parsePhraseResponse("   \n  ", "question")).toThrow();
  });
});

describe("parseChunkResponse", () => {
  it("parses translation with notes", () => {
    const r = parseChunkResponse(
      JSON.stringify({
        ru: "Ты не можешь так просто это провернуть.",
        notes: [
          { span: "get away with", ru: "выйти сухим из воды", kind: "idiom" },
          { span: "pull off", ru: "провернуть", kind: "phrasal" },
        ],
      }),
    );
    expect(r.ru).toBe("Ты не можешь так просто это провернуть.");
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]!.span).toBe("get away with");
  });

  it("skips malformed notes instead of failing the whole translation", () => {
    const r = parseChunkResponse(
      JSON.stringify({
        ru: "Перевод",
        notes: [{ span: "ok", ru: "ок" }, { span: "" }, null, "junk", { ru: "нет span" }],
      }),
    );
    expect(r.ru).toBe("Перевод");
    expect(r.notes).toHaveLength(1);
  });

  it("caps the number of notes", () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({
      span: `span ${i}`,
      ru: `перевод ${i}`,
      kind: "idiom",
    }));
    const r = parseChunkResponse(JSON.stringify({ ru: "Перевод", notes }));
    expect(r.notes.length).toBeLessThanOrEqual(4);
  });

  it("tolerates a missing notes field", () => {
    const r = parseChunkResponse(JSON.stringify({ ru: "Перевод" }));
    expect(r.notes).toEqual([]);
  });

  it("falls back to plain text", () => {
    const r = parseChunkResponse("Просто перевод строкой");
    expect(r.ru).toBe("Просто перевод строкой");
    expect(r.notes).toEqual([]);
  });
});

describe("buildChunkPrompt", () => {
  it("includes the sentence and asks for JSON", () => {
    const p = buildChunkPrompt("Hello there.");
    expect(p).toContain("Hello there.");
    expect(p).toContain("JSON only");
  });
});

describe("buildBatchPrompt", () => {
  it("includes every chunk's text and idx", () => {
    const p = buildBatchPrompt([
      { idx: 0, text: "You can't get away with that here." },
      { idx: 1, text: "She decided to figure out a plan." },
    ]);
    expect(p).toContain("[0]");
    expect(p).toContain("You can't get away with that here.");
    expect(p).toContain("[1]");
    expect(p).toContain("She decided to figure out a plan.");
  });

  it("tells the model to return empty phrase lists instead of inventing filler", () => {
    const p = buildBatchPrompt([{ idx: 0, text: "Hello there." }]);
    expect(p).toMatch(/empty.*phrases.*list/i);
    expect(p).toMatch(/never invent/i);
  });
});

describe("parseBatchResponse", () => {
  it("parses a well-formed batch fully", () => {
    const r = parseBatchResponse(
      JSON.stringify({
        chunks: [
          {
            idx: 0,
            ru: "Ты не можешь так просто это провернуть.",
            phrases: [
              {
                span: "get away with",
                ru: "выйти сухим из воды",
                definitionEn: "to do something wrong and not be punished",
                kind: "idiom",
                worth: 5,
              },
            ],
          },
          { idx: 1, ru: "Ничего особенного тут нет.", phrases: [] },
        ],
      }),
      [0, 1],
    );

    expect(r).toHaveLength(2);
    expect(r[0]!.chunkIdx).toBe(0);
    expect(r[0]!.ru).toBe("Ты не можешь так просто это провернуть.");
    expect(r[0]!.phrases).toHaveLength(1);
    expect(r[0]!.phrases[0]!.span).toBe("get away with");
    expect(r[0]!.phrases[0]!.worth).toBe(5);
    expect(r[1]!.phrases).toEqual([]);
  });

  it("drops a chunk whose idx is outside the requested set", () => {
    const r = parseBatchResponse(
      JSON.stringify({
        chunks: [
          { idx: 0, ru: "Перевод", phrases: [] },
          { idx: 7, ru: "Чужой чанк", phrases: [] },
        ],
      }),
      [0],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.chunkIdx).toBe(0);
  });

  it("skips a malformed chunk while keeping its siblings", () => {
    const r = parseBatchResponse(
      JSON.stringify({
        chunks: [
          { idx: 0, ru: "Первый", phrases: [] },
          { idx: 1, ru: null, phrases: [] },
          { idx: 2 },
          { idx: 3, ru: "Третий", phrases: [] },
        ],
      }),
      [0, 1, 2, 3],
    );
    expect(r.map((c) => c.chunkIdx)).toEqual([0, 3]);
  });

  it("clamps worth into 1..5 and defaults missing worth to 3", () => {
    const r = parseBatchResponse(
      JSON.stringify({
        chunks: [
          {
            idx: 0,
            ru: "Перевод",
            phrases: [
              { span: "a", ru: "а", worth: 0 },
              { span: "b", ru: "б", worth: 99 },
              { span: "c", ru: "в" },
            ],
          },
        ],
      }),
      [0],
    );
    expect(r[0]!.phrases.map((p) => p.worth)).toEqual([1, 5, 3]);
  });

  it("caps phrases at 3 per chunk", () => {
    const phrases = Array.from({ length: 10 }, (_, i) => ({
      span: `span ${i}`,
      ru: `перевод ${i}`,
      worth: 3,
    }));
    const r = parseBatchResponse(JSON.stringify({ chunks: [{ idx: 0, ru: "Перевод", phrases }] }), [0]);
    expect(r[0]!.phrases.length).toBeLessThanOrEqual(3);
  });

  it("normalizes an unknown kind to plain", () => {
    const r = parseBatchResponse(
      JSON.stringify({
        chunks: [{ idx: 0, ru: "Перевод", phrases: [{ span: "x", ru: "y", kind: "banana" }] }],
      }),
      [0],
    );
    expect(r[0]!.phrases[0]!.kind).toBe("plain");
  });

  it("returns [] for an unparseable payload", () => {
    expect(parseBatchResponse("not json at all {{{", [0])).toEqual([]);
  });

  it("parses a bare array without a `chunks` wrapper", () => {
    const r = parseBatchResponse(JSON.stringify([{ idx: 0, ru: "Перевод", phrases: [] }]), [0]);
    expect(r).toHaveLength(1);
  });

  it("parses JSON wrapped in a ```json code fence", () => {
    const r = parseBatchResponse(
      '```json\n{"chunks":[{"idx":0,"ru":"Перевод","phrases":[]}]}\n```',
      [0],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.ru).toBe("Перевод");
  });
});
