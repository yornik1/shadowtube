import { describe, expect, it } from "vitest";

import {
  MAX_PER_CHUNK,
  MAX_PER_SESSION,
  selectAutoCards,
} from "./autoCards";
import type { PhraseCandidate } from "@shadowtube/shared";

function phrase(over: Partial<PhraseCandidate> = {}): PhraseCandidate {
  return {
    span: "get away with",
    ru: "выйти сухим из воды",
    definitionEn: "to avoid punishment",
    kind: "idiom",
    worth: 5,
    ...over,
  };
}

const fresh = { alreadyKnown: new Set<string>(), sessionCount: 0 };

describe("selectAutoCards", () => {
  it("accepts a strong idiom", () => {
    const r = selectAutoCards([phrase()], fresh);
    expect(r.accepted).toHaveLength(1);
  });

  it("rejects phrases below the worth threshold", () => {
    const r = selectAutoCards([phrase({ worth: 3 })], fresh);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toBe("low-worth");
  });

  it("rejects transparent phrases even when the model rates them highly", () => {
    const r = selectAutoCards([phrase({ kind: "plain", worth: 5 })], fresh);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toBe("plain");
  });

  it("rejects auto-caption garbage", () => {
    const spans = ["figure out- - That's", "[Music] hello", "(laughs) sure", "42"];
    for (const span of spans) {
      const r = selectAutoCards([phrase({ span })], fresh);
      expect(r.accepted, span).toHaveLength(0);
      expect(r.rejected[0]!.reason, span).toBe("malformed");
    }
  });

  it("skips phrases already in the dictionary, case-insensitively", () => {
    const r = selectAutoCards([phrase({ span: "Get Away With" })], {
      ...fresh,
      alreadyKnown: new Set(["get away with"]),
    });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toBe("duplicate");
  });

  it("caps how many cards one chunk can produce", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      phrase({ span: `phrase number ${i}` }),
    );
    const r = selectAutoCards(many, fresh);
    expect(r.accepted).toHaveLength(MAX_PER_CHUNK);
    expect(r.rejected.some((x) => x.reason === "chunk-cap")).toBe(true);
  });

  it("keeps the most useful phrases when the chunk cap bites", () => {
    const r = selectAutoCards(
      [
        phrase({ span: "weak one", worth: 4 }),
        phrase({ span: "strong one", worth: 5 }),
        phrase({ span: "another weak", worth: 4 }),
      ],
      fresh,
    );
    expect(r.accepted.map((p) => p.span)).toContain("strong one");
  });

  it("stops entirely once the session cap is reached", () => {
    const r = selectAutoCards([phrase()], {
      ...fresh,
      sessionCount: MAX_PER_SESSION,
    });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]!.reason).toBe("session-cap");
  });

  it("respects the remaining session budget", () => {
    const r = selectAutoCards(
      [phrase({ span: "first phrase" }), phrase({ span: "second phrase" })],
      { ...fresh, sessionCount: MAX_PER_SESSION - 1 },
    );
    expect(r.accepted).toHaveLength(1);
  });

  it("handles an empty phrase list", () => {
    expect(selectAutoCards([], fresh).accepted).toEqual([]);
  });
});
