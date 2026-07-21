import { describe, expect, it } from "vitest";

import {
  isSelected,
  nearestWordIndex,
  selectedText,
  selectedWordCount,
  selectionBounds,
  toggleSelection,
  tokenize,
  type Selection,
} from "./spanSelection";

const SENTENCE = "You can't get away with that here.";
const tokens = tokenize(SENTENCE);

/** Индекс токена по слову — тесты не должны зависеть от арифметики пробелов. */
function idxOf(word: string): number {
  const t = tokens.find((x) => x.type === "word" && x.value.includes(word));
  if (!t) throw new Error(`token not found: ${word}`);
  return t.index;
}

describe("tokenize", () => {
  it("keeps spaces as separate tokens so the original text can be rebuilt", () => {
    expect(tokens.map((t) => t.value).join("")).toBe(SENTENCE);
  });

  it("indexes tokens in order", () => {
    expect(tokens.every((t, i) => t.index === i)).toBe(true);
  });

  it("handles an empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("toggleSelection", () => {
  it("first tap selects a single word", () => {
    expect(toggleSelection(null, 4)).toEqual({ anchor: 4, focus: 4 });
  });

  it("tapping the same word again clears the selection", () => {
    expect(toggleSelection({ anchor: 4, focus: 4 }, 4)).toBeNull();
  });

  it("second tap on another word stretches the selection into a range", () => {
    expect(toggleSelection({ anchor: 4, focus: 4 }, 8)).toEqual({
      anchor: 4,
      focus: 8,
    });
  });

  it("tapping while a range is active starts a fresh single-word selection", () => {
    expect(toggleSelection({ anchor: 4, focus: 8 }, 2)).toEqual({
      anchor: 2,
      focus: 2,
    });
  });

  it("supports selecting right to left", () => {
    const sel = toggleSelection({ anchor: 8, focus: 8 }, 4) as Selection;
    expect(selectionBounds(sel)).toEqual({ from: 4, to: 8 });
  });
});

describe("isSelected", () => {
  it("covers every token inside the range, including spaces", () => {
    const sel = { anchor: 2, focus: 6 };
    expect(isSelected(sel, 2)).toBe(true);
    expect(isSelected(sel, 4)).toBe(true);
    expect(isSelected(sel, 6)).toBe(true);
    expect(isSelected(sel, 7)).toBe(false);
    expect(isSelected(null, 4)).toBe(false);
  });
});

describe("selectedText", () => {
  it("returns a single word", () => {
    const sel = { anchor: idxOf("away"), focus: idxOf("away") };
    expect(selectedText(tokens, sel)).toBe("away");
  });

  it("returns a multi-word phrase with its spaces", () => {
    const sel = { anchor: idxOf("get"), focus: idxOf("with") };
    expect(selectedText(tokens, sel)).toBe("get away with");
  });

  it("strips punctuation at the edges of the selection", () => {
    const sel = { anchor: idxOf("that"), focus: idxOf("here") };
    expect(selectedText(tokens, sel)).toBe("that here");
  });

  it("keeps an apostrophe inside a word", () => {
    const sel = { anchor: idxOf("can't"), focus: idxOf("can't") };
    expect(selectedText(tokens, sel)).toBe("can't");
  });

  it("returns an empty string without a selection", () => {
    expect(selectedText(tokens, null)).toBe("");
  });

  it("works when the selection is made right to left", () => {
    const sel = { anchor: idxOf("with"), focus: idxOf("get") };
    expect(selectedText(tokens, sel)).toBe("get away with");
  });
});

describe("nearestWordIndex", () => {
  it("returns the word itself when the tap lands on it", () => {
    const i = idxOf("away");
    expect(nearestWordIndex(tokens, i)).toBe(i);
  });

  it("maps a tap on the gap to the word before it", () => {
    const wordIdx = idxOf("get");
    // Токен сразу после слова — пробел.
    expect(tokens[wordIdx + 1]!.type).toBe("space");
    expect(nearestWordIndex(tokens, wordIdx + 1)).toBe(wordIdx);
  });

  it("falls forward when the gap is at the very beginning", () => {
    const leading = tokenize("   hello world");
    expect(leading[0]!.type).toBe("space");
    expect(nearestWordIndex(leading, 0)).toBe(1);
  });

  it("returns null when there are no words at all", () => {
    expect(nearestWordIndex(tokenize("   "), 0)).toBeNull();
    expect(nearestWordIndex(tokens, 999)).toBeNull();
  });
});

describe("selectedWordCount", () => {
  it("counts words, not space tokens", () => {
    const sel = { anchor: idxOf("get"), focus: idxOf("with") };
    expect(selectedWordCount(tokens, sel)).toBe(3);
  });

  it("is zero without a selection", () => {
    expect(selectedWordCount(tokens, null)).toBe(0);
  });
});
