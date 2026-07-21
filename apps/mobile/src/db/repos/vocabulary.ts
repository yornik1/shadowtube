import { and, asc, desc, eq, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import { vocabulary, type VocabularyKind } from "../schema";
import { nextReview, type Grade } from "@/src/srs/sm2";

export type VocabularyRow = typeof vocabulary.$inferSelect;

export type NewVocabularyEntry = {
  /** Английская сторона: выделенная фраза или весь чанк. */
  text: string;
  context: string;
  /** Естественный русский перевод. */
  translation: string;
  definitionEn?: string;
  literal?: string;
  note?: string;
  kind?: VocabularyKind;
  sourceVideoId?: string;
  startSec?: number;
  endSec?: number;
  chunkIdx?: number;
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Уже сохранённая карточка с тем же текстом — чтобы не плодить дубли. */
export async function findEntry(
  text: string,
  sourceVideoId?: string,
): Promise<VocabularyRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(vocabulary)
    .where(
      sourceVideoId
        ? and(
            sql`lower(trim(${vocabulary.word})) = ${normalize(text)}`,
            eq(vocabulary.sourceVideoId, sourceVideoId),
          )
        : sql`lower(trim(${vocabulary.word})) = ${normalize(text)}`,
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Сохраняет карточку. Повторное сохранение той же фразы из того же видео
 * не создаёт дубль — возвращает `created: false`.
 *
 * `dueAt = now`: в MVP это поле не заполнялось, и карточка никогда не
 * попадала в очередь повторений.
 */
export async function addVocabularyEntry(
  entry: NewVocabularyEntry,
  now: Date = new Date(),
): Promise<{ created: boolean; row: VocabularyRow }> {
  const text = entry.text.trim();
  if (!text) throw new Error("Пустая фраза");

  const existing = await findEntry(text, entry.sourceVideoId);
  if (existing) return { created: false, row: existing };

  const db = getDb();
  const inserted = await db
    .insert(vocabulary)
    .values({
      word: text,
      context: entry.context.trim(),
      translation: entry.translation.trim(),
      definitionEn: entry.definitionEn?.trim() || null,
      literal: entry.literal?.trim() || null,
      note: entry.note?.trim() || null,
      kind: entry.kind ?? "phrase",
      sourceVideoId: entry.sourceVideoId ?? null,
      startSec: entry.startSec ?? null,
      endSec: entry.endSec ?? null,
      chunkIdx: entry.chunkIdx ?? null,
      addedAt: now,
      dueAt: now,
    })
    .returning();

  return { created: true, row: inserted[0]! };
}

export async function listVocabulary(search?: string): Promise<VocabularyRow[]> {
  const db = getDb();
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .select()
      .from(vocabulary)
      .where(
        or(
          like(vocabulary.word, q),
          like(vocabulary.translation, q),
          like(vocabulary.context, q),
        ),
      )
      .orderBy(desc(vocabulary.addedAt));
  }
  return db.select().from(vocabulary).orderBy(desc(vocabulary.addedAt));
}

/** Очередь на сегодня: самые «просроченные» первыми. */
export async function listDue(
  limit = 20,
  now: Date = new Date(),
): Promise<VocabularyRow[]> {
  const db = getDb();
  return db
    .select()
    .from(vocabulary)
    .where(lte(vocabulary.dueAt, now))
    .orderBy(asc(vocabulary.dueAt))
    .limit(limit);
}

export async function countDue(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(vocabulary)
    .where(lte(vocabulary.dueAt, now));
  return Number(rows[0]?.count ?? 0);
}

/** Записывает оценку и пересчитывает интервал по SM-2. */
export async function applyReview(
  id: number,
  grade: Grade,
  now: Date = new Date(),
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(vocabulary)
    .where(eq(vocabulary.id, id))
    .limit(1);

  const card = rows[0];
  if (!card) return;

  const outcome = nextReview(
    {
      ef: card.ef,
      intervalDays: card.intervalDays,
      reps: card.reps,
      lapses: card.lapses,
    },
    grade,
    now,
  );

  await db
    .update(vocabulary)
    .set({
      ef: outcome.ef,
      intervalDays: outcome.intervalDays,
      reps: outcome.reps,
      lapses: outcome.lapses,
      dueAt: outcome.dueAt,
      lastReviewedAt: outcome.lastReviewedAt,
    })
    .where(eq(vocabulary.id, id));
}

export async function deleteVocabulary(id: number) {
  const db = getDb();
  await db.delete(vocabulary).where(eq(vocabulary.id, id));
}

export async function countVocabulary() {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(vocabulary);
  return Number(rows[0]?.count ?? 0);
}
