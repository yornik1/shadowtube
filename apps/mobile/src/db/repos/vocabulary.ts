import { eq, desc, like, or, sql } from "drizzle-orm";
import { db } from "../client";
import { vocabulary } from "../schema";

export async function addVocabularyEntry(entry: {
  word: string;
  phrase?: string;
  context: string;
  translation: string;
  sourceVideoId?: string;
}) {
  await db.insert(vocabulary).values({
    word: entry.word,
    phrase: entry.phrase ?? null,
    context: entry.context,
    translation: entry.translation,
    sourceVideoId: entry.sourceVideoId ?? null,
    addedAt: new Date(),
  });
}

export async function listVocabulary(search?: string) {
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

export async function deleteVocabulary(id: number) {
  await db.delete(vocabulary).where(eq(vocabulary.id, id));
}

export async function countVocabulary() {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(vocabulary);
  return Number(rows[0]?.count ?? 0);
}
