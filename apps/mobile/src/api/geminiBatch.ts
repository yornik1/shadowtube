/**
 * Пакетный перевод чанков — скользящим окном вокруг текущего.
 *
 * Экономика: free tier Gemini даёт 250 запросов в сутки (10 в минуту), а
 * трёхчасовое видео — 1234 чанка. Запрос на чанк означал бы, что одно видео
 * не помещается в дневную квоту в пять раз. Пакет из 20 чанков и окно вокруг
 * текущей позиции превращают сессию шедоуинга в 2-4 запроса.
 *
 * Переводить видео целиком вперёд нельзя из-за лимита 10 запросов в минуту:
 * 62 пакета встали бы в шестиминутную очередь. Поэтому тянем только то, что
 * человек вот-вот увидит.
 */
import type { ChunkAnalysis } from "@shadowtube/shared";
import { buildBatchPrompt, parseBatchResponse } from "./geminiPrompts";
import { windowIndexes } from "./batchWindow";
import { MAX_OUTPUT_TOKENS_BATCH, callWithFallback } from "./gemini";
import { getCachedChunks, saveChunkAnalyses } from "@/src/db/repos/chunkCache";
import { bumpRequestCount } from "@/src/db/repos/appState";
import { isFakeGemini, fakeBatchAnalyses } from "./geminiFake";
import { dlog } from "@/src/utils/devLog";

export { LOOKAHEAD, windowIndexes } from "./batchWindow";

/** Разбор чанка, готовый к показу; null — перевода пока нет. */
const memory = new Map<string, ChunkAnalysis>();
const inflight = new Map<string, Promise<void>>();

function key(videoId: string, idx: number): string {
  return `${videoId}:${idx}`;
}

export function getAnalysis(
  videoId: string,
  idx: number,
): ChunkAnalysis | undefined {
  return memory.get(key(videoId, idx));
}

function remember(videoId: string, analyses: ChunkAnalysis[]): void {
  for (const a of analyses) memory.set(key(videoId, a.chunkIdx), a);
}

/**
 * Гарантирует, что окно вокруг текущего чанка переведено.
 *
 * Порядок источников: память → SQLite → сеть. Сетевой запрос уходит только
 * за тем, чего нет нигде, и повторный вызов на тот же диапазон не плодит
 * параллельные запросы.
 */
export async function ensureWindow(params: {
  apiKey: string;
  videoId: string;
  chunkTexts: string[];
  currentIdx: number;
  model: string;
}): Promise<void> {
  const { apiKey, videoId, chunkTexts, currentIdx, model } = params;
  const idxs = windowIndexes(currentIdx, chunkTexts.length);
  const missing = idxs.filter((i) => !memory.has(key(videoId, i)));
  if (missing.length === 0) return;

  const batchKey = `${videoId}:${missing[0]}-${missing[missing.length - 1]}`;
  const pending = inflight.get(batchKey);
  if (pending) return pending;

  const texts = new Map<number, string>();
  for (const i of missing) texts.set(i, chunkTexts[i] ?? "");

  const task = (async () => {
    const cached = await getCachedChunks(videoId, missing, texts);
    if (cached.size > 0) {
      remember(videoId, [...cached.values()]);
      dlog("batch", `cache hit ${cached.size}/${missing.length}`);
    }

    const stillMissing = missing.filter((i) => !cached.has(i));
    if (stillMissing.length === 0) return;

    const payload = stillMissing.map((idx) => ({
      idx,
      text: chunkTexts[idx] ?? "",
    }));

    let analyses: ChunkAnalysis[];
    if (isFakeGemini()) {
      analyses = fakeBatchAnalyses(payload);
    } else {
      const raw = await callWithFallback(
        apiKey,
        model,
        buildBatchPrompt(payload),
        MAX_OUTPUT_TOKENS_BATCH,
      );
      await bumpRequestCount();
      analyses = parseBatchResponse(raw, stillMissing);
    }

    if (analyses.length === 0) return;
    remember(videoId, analyses);
    await saveChunkAnalyses(videoId, analyses, texts, model);
    dlog("batch", `translated ${analyses.length}/${stillMissing.length} chunks`);
  })().finally(() => inflight.delete(batchKey));

  inflight.set(batchKey, task);
  return task;
}

/** Сброс памяти при смене видео — иначе она растёт весь сеанс. */
export function forgetVideo(videoId: string): void {
  for (const k of [...memory.keys()]) {
    if (k.startsWith(`${videoId}:`)) memory.delete(k);
  }
}
