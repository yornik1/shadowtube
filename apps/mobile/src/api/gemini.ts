import type { ChunkTranslation, PhraseTranslation } from "@shadowtube/shared";
import {
  buildChunkPrompt,
  buildPhrasePrompt,
  parseChunkResponse,
  parsePhraseResponse,
} from "./geminiPrompts";
import {
  fakeChunkTranslation,
  fakePhraseTranslation,
  isFakeGemini,
} from "./geminiFake";

/** Алиас — всегда последний Flash. Если 404, fallback на gemma. */
export const DEFAULT_MODEL = "gemini-2.5-flash-latest";

export type GeminiModelInfo = {
  id: string;
  displayName: string;
};

const FALLBACK_MODELS = [
  "gemini-2.5-flash-latest",
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it",
  "gemini-2.5-flash-lite",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SKIP_MODEL = /embed|aqa|imagen|veo|tts|live|nano-banana|robotics|computer-use/i;

function formatApiError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; code?: number };
    };
    const msg = j.error?.message;
    if (msg) return `${j.error?.code ?? status}: ${msg}`;
  } catch {
    // not JSON
  }
  return body.slice(0, 200) || `API error ${status}`;
}

async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(formatApiError(res.status, text)) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty response from model");
  return raw;
}

function modelsToTry(preferred: string): string[] {
  return [...new Set([preferred.trim() || DEFAULT_MODEL, ...FALLBACK_MODELS])];
}

const RETRY_STATUSES = new Set([404, 429, 500, 503]);

async function callWithFallback(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  let lastError: Error | null = null;
  for (const m of modelsToTry(model)) {
    try {
      return await callModel(apiKey, m, prompt);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const status = (e as Error & { status?: number }).status;
      if (status != null && !RETRY_STATUSES.has(status)) break;
    }
  }
  throw lastError ?? new Error("Translation failed");
}

/**
 * Кэш + дедупликация параллельных запросов.
 *
 * Один и тот же чанк переводится один раз за сессию: prefetch греет кэш при
 * смене чанка, тап по фразе почти всегда попадает в готовый результат.
 */
function memoize<T>(): {
  get: (key: string) => T | undefined;
  run: (key: string, fn: () => Promise<T>) => Promise<T>;
} {
  const done = new Map<string, T>();
  const inflight = new Map<string, Promise<T>>();

  return {
    get: (key) => done.get(key),
    run: (key, fn) => {
      const cached = done.get(key);
      if (cached) return Promise.resolve(cached);

      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = fn()
        .then((value) => {
          done.set(key, value);
          return value;
        })
        .finally(() => inflight.delete(key));

      inflight.set(key, promise);
      return promise;
    },
  };
}

const chunkCache = memoize<ChunkTranslation>();
const phraseCache = memoize<PhraseTranslation>();

function chunkKey(context: string): string {
  return context.trim();
}

function phraseKey(span: string, context: string): string {
  return `${span.trim().toLowerCase()}|${context.trim()}`;
}

/** Перевод всего чанка целиком + разбор идиом внутри него. */
export async function translateChunk(
  apiKey: string,
  context: string,
  model = DEFAULT_MODEL,
): Promise<ChunkTranslation> {
  const key = chunkKey(context);
  if (!key) throw new Error("Empty chunk");

  return chunkCache.run(key, async () => {
    if (isFakeGemini()) return fakeChunkTranslation(key);
    const raw = await callWithFallback(apiKey, model, buildChunkPrompt(key));
    return parseChunkResponse(raw);
  });
}

/** Готовый перевод чанка, если он уже в кэше (для мгновенного рендера). */
export function getCachedChunkTranslation(
  context: string,
): ChunkTranslation | undefined {
  return chunkCache.get(chunkKey(context));
}

/**
 * Перевод выделенного отрезка В КОНТЕКСТЕ чанка.
 *
 * Пословный режим убран намеренно: слово в вакууме ломается на идиомах,
 * ради которых всё и затевалось.
 */
export async function translatePhrase(
  apiKey: string,
  span: string,
  context: string,
  model = DEFAULT_MODEL,
): Promise<PhraseTranslation> {
  const cleanSpan = span.trim();
  if (!cleanSpan) throw new Error("Empty phrase");
  const cleanContext = context.trim() || cleanSpan;

  return phraseCache.run(phraseKey(cleanSpan, cleanContext), async () => {
    if (isFakeGemini()) return fakePhraseTranslation(cleanSpan);
    const raw = await callWithFallback(
      apiKey,
      model,
      buildPhrasePrompt(cleanSpan, cleanContext),
    );
    return parsePhraseResponse(raw, cleanSpan);
  });
}

/** Греем перевод чанка заранее — первый тап по фразе ощущается мгновенным. */
export function prefetchChunk(
  apiKey: string,
  context: string,
  model = DEFAULT_MODEL,
): void {
  if (!context.trim() || !apiKey) return;
  translateChunk(apiKey, context, model).catch(() => {});
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  const r = await verifyApiKey(apiKey);
  return r.ok;
}

function sortModels(models: GeminiModelInfo[]): GeminiModelInfo[] {
  const rank = (id: string) => {
    if (id.includes("flash-latest")) return 0;
    if (id.startsWith("gemma-")) return 1;
    if (id.includes("flash") && !/preview|exp|thinking/.test(id)) return 2;
    return 3;
  };
  return [...models].sort((a, b) => {
    const d = rank(a.id) - rank(b.id);
    return d !== 0 ? d : a.displayName.localeCompare(b.displayName);
  });
}

/** Лучший дефолт из списка, доступного ключу. */
export function pickDefaultModel(models: GeminiModelInfo[]): string {
  const flashLatest = models.find((m) => m.id.includes("flash-latest"));
  if (flashLatest) return flashLatest.id;
  const gemma = models.find((m) => m.id.startsWith("gemma-4-26b"));
  if (gemma) return gemma.id;
  return models[0]?.id ?? DEFAULT_MODEL;
}

export async function listAvailableModels(
  apiKey: string,
): Promise<GeminiModelInfo[]> {
  const out: GeminiModelInfo[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  do {
    const url = new URL(BASE);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(formatApiError(res.status, await res.text()));
    }

    const data = (await res.json()) as {
      models?: {
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }[];
      nextPageToken?: string;
    };

    for (const m of data.models ?? []) {
      if (!m.supportedGenerationMethods?.includes("generateContent")) continue;
      const id = m.name.replace(/^models\//, "");
      if (SKIP_MODEL.test(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, displayName: m.displayName ?? id });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return sortModels(out);
}

export async function verifyApiKey(
  apiKey: string,
): Promise<
  | { ok: true; models: GeminiModelInfo[] }
  | { ok: false; error: string }
> {
  try {
    const models = await listAvailableModels(apiKey);
    if (models.length === 0) {
      return { ok: false, error: "Нет моделей с generateContent" };
    }
    return { ok: true, models };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось проверить ключ",
    };
  }
}
