import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAKE_PREFIX,
  fakeChunkTranslation,
  fakePhraseTranslation,
  isFakeGemini,
} from "./geminiFake";

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_FAKE_GEMINI;

beforeEach(() => {
  globals.__DEV__ = true;
});

afterEach(() => {
  globals.__DEV__ = originalDev;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_FAKE_GEMINI;
  else process.env.EXPO_PUBLIC_FAKE_GEMINI = originalFlag;
  vi.restoreAllMocks();
});

describe("isFakeGemini", () => {
  it("is off unless the flag is explicitly set", () => {
    delete process.env.EXPO_PUBLIC_FAKE_GEMINI;
    expect(isFakeGemini()).toBe(false);
  });

  it("turns on with the env flag in a dev build", () => {
    process.env.EXPO_PUBLIC_FAKE_GEMINI = "1";
    expect(isFakeGemini()).toBe(true);
  });

  it("stays off in a production build even with the flag", () => {
    process.env.EXPO_PUBLIC_FAKE_GEMINI = "1";
    globals.__DEV__ = false;
    expect(isFakeGemini()).toBe(false);
  });

  it("ignores any value other than 1", () => {
    process.env.EXPO_PUBLIC_FAKE_GEMINI = "true";
    expect(isFakeGemini()).toBe(false);
  });
});

describe("fakePhraseTranslation", () => {
  it("returns a full canned entry for a known idiom", async () => {
    const r = await fakePhraseTranslation("get away with");
    expect(r.ru).toBe("выйти сухим из воды");
    expect(r.kind).toBe("idiom");
    expect(r.note).toBeTruthy();
    expect(r.definitionEn).toBeTruthy();
  });

  it("matches canned entries regardless of case and padding", async () => {
    const r = await fakePhraseTranslation("  Get Away With  ");
    expect(r.ru).toBe("выйти сухим из воды");
  });

  it("marks generated translations as fake so they cannot pass for real", async () => {
    const r = await fakePhraseTranslation("some unknown phrase");
    expect(r.ru).toContain(FAKE_PREFIX);
    expect(r.definitionEn).toContain(FAKE_PREFIX);
  });

  it("fills every field the card modes rely on", async () => {
    const r = await fakePhraseTranslation("whatever");
    expect(r.ru.length).toBeGreaterThan(0);
    expect(r.definitionEn.length).toBeGreaterThan(0);
    expect(r.kind).toBeTruthy();
  });
});

describe("fakeChunkTranslation", () => {
  it("returns a marked translation with no notes", async () => {
    const r = await fakeChunkTranslation("How do you get 'em in a room together?");
    expect(r.ru).toContain(FAKE_PREFIX);
    expect(r.notes).toEqual([]);
  });
});
