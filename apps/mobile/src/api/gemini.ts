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

/**
 * Всегда «latest»-алиас, а не прибитая версия: Google выкатывает новые модели
 * и режет квоты старым (у gemini-2.5-flash осталось 20 запросов в сутки).
 *
 * Именно flash-lite, а не flash: проверено запросом — `gemini-flash-lite-latest`
 * резолвится в gemini-3.5-flash-lite, отдаёт чистый JSON и тратит НОЛЬ токенов
 * на размышления, тогда как `gemini-flash-latest` (gemini-3.6-flash) сжёг 316
 * thinking-токенов на перевод одного предложения. На пакете из 20 чанков это
 * съело бы весь бюджет вывода.
 */
export const DEFAULT_MODEL = "gemini-flash-lite-latest";

export type GeminiModelInfo = {
  id: string;
  displayName: string;
};

/**
 * Порядок отката. Gemma намеренно ИСКЛЮЧЕНА: она отвечает 200, но игнорирует
 * требование «только JSON» и выдаёт прозу с буллетами («* Source sentence:
 * ...»), то есть как фолбэк для структурированного вывода бесполезна.
 * Прибитые версии — только последним рубежом, если алиасы отвалятся.
 */
const FALLBACK_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
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

/** Одна фраза или один чанк: ответ короткий. */
export const MAX_OUTPUT_TOKENS_SINGLE = 1024;
/**
 * Пакет из 20 чанков: перевод плюс до трёх фраз с определениями на каждый.
 * По замерам это ~150 токенов на чанк, и упереться в потолок здесь означает
 * оборванный JSON и потерю всего пакета, а не одного чанка.
 */
export const MAX_OUTPUT_TOKENS_BATCH = 8192;

async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const url = `${BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens },
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

export async function callWithFallback(
  apiKey: string,
  model: string,
  prompt: string,
  maxOutputTokens = MAX_OUTPUT_TOKENS_SINGLE,
): Promise<string> {
  let lastError: Error | null = null;
  for (const m of modelsToTry(model)) {
    try {
      return await callModel(apiKey, m, prompt, maxOutputTokens);
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

/**
 * Лучший дефолт из списка, доступного ключу.
 *
 * flash-lite впереди flash: у него нет thinking-токенов и вчетверо больше
 * дневная квота, а качества для перевода чанков хватает. Gemma не предлагается
 * вовсе — она не держит формат JSON.
 */
export function pickDefaultModel(models: GeminiModelInfo[]): string {
  const liteLatest = models.find((m) => m.id === "gemini-flash-lite-latest");
  if (liteLatest) return liteLatest.id;
  const anyLiteLatest = models.find((m) => m.id.includes("flash-lite-latest"));
  if (anyLiteLatest) return anyLiteLatest.id;
  const flashLatest = models.find((m) => m.id.includes("flash-latest"));
  if (flashLatest) return flashLatest.id;
  const lite = models.find((m) => m.id.includes("flash-lite"));
  if (lite) return lite.id;
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
