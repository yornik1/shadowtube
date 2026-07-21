import { describe, expect, it } from "vitest";

import { buildCard, isCardMode, type CardSource } from "./cardModes";

const entry: CardSource = {
  word: "get away with",
  translation: "выйти сухим из воды",
  definitionEn: "to do something wrong and not be punished",
  context: "You can't get away with that here.",
};

describe("buildCard — ru_to_en", () => {
  it("shows Russian first so the learner has to produce English", () => {
    const c = buildCard(entry, "ru_to_en");
    expect(c.front).toBe("выйти сухим из воды");
    expect(c.back).toBe("get away with");
    expect(c.prompt).toMatch(/вслух/i);
  });

  it("keeps the source sentence under the answer", () => {
    expect(buildCard(entry, "ru_to_en").backSecondary).toBe(
      "You can't get away with that here.",
    );
  });
});

describe("buildCard — en_to_ru", () => {
  it("shows English first and Russian as the answer", () => {
    const c = buildCard(entry, "en_to_ru");
    expect(c.front).toBe("get away with");
    expect(c.back).toBe("выйти сухим из воды");
  });
});

describe("buildCard — en_to_en", () => {
  it("answers with the English definition", () => {
    const c = buildCard(entry, "en_to_en");
    expect(c.front).toBe("get away with");
    expect(c.back).toBe("to do something wrong and not be punished");
  });

  it("keeps Russian available behind a button", () => {
    expect(buildCard(entry, "en_to_en").fallbackRu).toBe("выйти сухим из воды");
  });

  it("falls back to the translation for entries saved before definitions existed", () => {
    const legacy: CardSource = { word: "spam", translation: "спам", definitionEn: null };
    const c = buildCard(legacy, "en_to_en");
    expect(c.back).toBe("спам");
    expect(c.fallbackRu).toBeUndefined();
  });

  it("treats a blank definition as missing", () => {
    const c = buildCard({ ...entry, definitionEn: "   " }, "en_to_en");
    expect(c.back).toBe("выйти сухим из воды");
  });
});

describe("buildCard — general", () => {
  it("omits the secondary line when there is no context", () => {
    const c = buildCard({ word: "spam", translation: "спам" }, "ru_to_en");
    expect(c.backSecondary).toBeUndefined();
  });

  it("always fills both sides for every mode", () => {
    for (const mode of ["ru_to_en", "en_to_ru", "en_to_en"] as const) {
      const c = buildCard(entry, mode);
      expect(c.front.length).toBeGreaterThan(0);
      expect(c.back.length).toBeGreaterThan(0);
      expect(c.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe("isCardMode", () => {
  it("accepts known modes and rejects junk from storage", () => {
    expect(isCardMode("ru_to_en")).toBe(true);
    expect(isCardMode("en_to_en")).toBe(true);
    expect(isCardMode("banana")).toBe(false);
    expect(isCardMode(null)).toBe(false);
  });
});
