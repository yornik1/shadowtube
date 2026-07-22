/**
 * Персистентный кэш переводов чанков.
 *
 * Free tier Gemini — 250 запросов в сутки, а трёхчасовое видео это 1234 чанка.
 * Кэш в памяти умирал вместе с приложением, из-за чего повторный заход в то же
 * видео снова жёг квоту. Здесь он переживает перезапуск, и второй проход по
 * видео стоит ноль запросов (плюс работает офлайн).
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../client";
import { chunkTranslations } from "../schema";
import type { ChunkAnalysis, PhraseCandidate } from "@shadowtube/shared";

/**
 * Дешёвый стабильный хэш (djb2). Криптостойкость не нужна — задача только
 * заметить, что субтитры у видео поменялись и кэш пора считать протухшим.
 */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function parsePhrases(json: string): PhraseCandidate[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PhraseCandidate[]) : [];
  } catch {
    return [];
  }
}

/** Кэшированные разборы для указанных чанков одного видео. */
export async function getCachedChunks(
  videoId: string,
  idxs: number[],
  texts: Map<number, string>,
): Promise<Map<number, ChunkAnalysis>> {
  const out = new Map<number, ChunkAnalysis>();
  if (idxs.length === 0) return out;

  const db = getDb();
  const rows = await db
    .select()
    .from(chunkTranslations)
    .where(
      and(
        eq(chunkTranslations.videoId, videoId),
        inArray(chunkTranslations.chunkIdx, idxs),
      ),
    );

  for (const row of rows) {
    // Текст чанка изменился (перезалили субтитры) — старый перевод не наш.
    const currentText = texts.get(row.chunkIdx);
    if (currentText != null && hashText(currentText) !== row.textHash) continue;

    out.set(row.chunkIdx, {
      chunkIdx: row.chunkIdx,
      ru: row.ru,
      phrases: parsePhrases(row.phrasesJson),
    });
  }
  return out;
}

export async function saveChunkAnalyses(
  videoId: string,
  analyses: ChunkAnalysis[],
  texts: Map<number, string>,
  model: string,
  now: Date = new Date(),
): Promise<void> {
  if (analyses.length === 0) return;
  const db = getDb();

  for (const a of analyses) {
    const text = texts.get(a.chunkIdx);
    if (text == null) continue;
    await db
      .insert(chunkTranslations)
      .values({
        videoId,
        chunkIdx: a.chunkIdx,
        textHash: hashText(text),
        ru: a.ru,
        phrasesJson: JSON.stringify(a.phrases),
        model,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [chunkTranslations.videoId, chunkTranslations.chunkIdx],
        set: {
          textHash: hashText(text),
          ru: a.ru,
          phrasesJson: JSON.stringify(a.phrases),
          model,
          createdAt: now,
        },
      });
  }
}

/** Сколько чанков видео уже переведено — для индикатора прогресса. */
export async function countCachedChunks(videoId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ idx: chunkTranslations.chunkIdx })
    .from(chunkTranslations)
    .where(eq(chunkTranslations.videoId, videoId));
  return rows.length;
}
