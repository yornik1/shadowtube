import { describe, expect, it } from "vitest";

import { LOOKAHEAD, windowIndexes } from "./batchWindow";

describe("windowIndexes", () => {
  it("covers the current chunk and the lookahead", () => {
    expect(windowIndexes(0, 100, 3)).toEqual([0, 1, 2, 3]);
  });

  it("never runs past the end of the video", () => {
    expect(windowIndexes(98, 100, 5)).toEqual([98, 99]);
  });

  it("handles the very last chunk", () => {
    expect(windowIndexes(99, 100, 5)).toEqual([99]);
  });

  it("clamps a negative index instead of producing junk", () => {
    expect(windowIndexes(-3, 10, 2)).toEqual([0, 1, 2]);
  });

  it("returns nothing for an empty video", () => {
    expect(windowIndexes(0, 0, 5)).toEqual([]);
  });

  it("keeps a whole batch worth of chunks by default", () => {
    // Окно должно совпадать с размером пакета: иначе на каждый шаг вперёд
    // уходил бы новый запрос вместо одного на весь пакет.
    expect(windowIndexes(0, 1000).length).toBe(LOOKAHEAD + 1);
  });
});
