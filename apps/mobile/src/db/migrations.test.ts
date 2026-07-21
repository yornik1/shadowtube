import { describe, expect, it } from "vitest";

import { planColumnMigrations, VOCABULARY_COLUMNS } from "./migrations";

describe("planColumnMigrations", () => {
  it("adds only the columns that are missing", () => {
    const sql = planColumnMigrations("vocabulary", ["id", "word"], {
      word: "TEXT",
      kind: "TEXT NOT NULL DEFAULT 'phrase'",
      note: "TEXT",
    });

    expect(sql).toEqual([
      "ALTER TABLE vocabulary ADD COLUMN kind TEXT NOT NULL DEFAULT 'phrase';",
      "ALTER TABLE vocabulary ADD COLUMN note TEXT;",
    ]);
  });

  it("returns nothing when the table is already up to date", () => {
    const existing = ["id", "word", ...Object.keys(VOCABULARY_COLUMNS)];
    expect(planColumnMigrations("vocabulary", existing, VOCABULARY_COLUMNS)).toEqual([]);
  });

  it("never emits DROP or table rewrites — only ADD COLUMN", () => {
    const sql = planColumnMigrations("vocabulary", [], VOCABULARY_COLUMNS);
    expect(sql.length).toBe(Object.keys(VOCABULARY_COLUMNS).length);
    expect(sql.every((s) => s.startsWith("ALTER TABLE vocabulary ADD COLUMN "))).toBe(true);
    expect(sql.some((s) => /DROP|DELETE|RENAME/i.test(s))).toBe(false);
  });

  it("rejects a NOT NULL column without DEFAULT (SQLite cannot backfill it)", () => {
    expect(() =>
      planColumnMigrations("vocabulary", [], { broken: "TEXT NOT NULL" }),
    ).toThrow(/NOT NULL without DEFAULT/);
  });

  it("accepts NOT NULL when a DEFAULT is present", () => {
    expect(() =>
      planColumnMigrations("vocabulary", [], { lapses: "INTEGER NOT NULL DEFAULT 0" }),
    ).not.toThrow();
  });

  it("rejects identifiers that could carry injected SQL", () => {
    expect(() =>
      planColumnMigrations("vocabulary", [], { "bad; DROP TABLE videos": "TEXT" }),
    ).toThrow(/Unsafe SQL identifier/);
    expect(() =>
      planColumnMigrations("vocabulary", [], { ok: "TEXT; DROP TABLE videos" }),
    ).toThrow(/Unsafe column definition/);
  });
});

describe("VOCABULARY_COLUMNS", () => {
  it("every NOT NULL column carries a DEFAULT so existing rows survive", () => {
    for (const [name, def] of Object.entries(VOCABULARY_COLUMNS)) {
      if (/NOT\s+NULL/i.test(def)) {
        expect(def, `${name} must have a DEFAULT`).toMatch(/DEFAULT/i);
      }
    }
  });

  it("carries the fields the SRS and the phrase mode need", () => {
    expect(Object.keys(VOCABULARY_COLUMNS)).toEqual(
      expect.arrayContaining([
        "kind",
        "definition_en",
        "start_sec",
        "chunk_idx",
        "last_reviewed_at",
        "lapses",
      ]),
    );
  });
});
