import type { TranslationResult } from "@shadowtube/shared";

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
const MAX_WORDS_PER_CHUNK = 24;

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

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim());
  const braces = raw.match(/\{[\s\S]*\}/);
  if (braces?.[0]) return JSON.parse(braces[0]);
  throw new Error("Could not parse translation response");
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^\w'-]/g, "").trim();
}

function wordsInSentence(text: string): string[] {
  const raw = text.match(/[a-zA-Z''-]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of raw) {
    const n = normalizeWord(w);
    if (n.length < 2 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_WORDS_PER_CHUNK) break;
  }
  return out;
}

function trimResult(r: TranslationResult): TranslationResult {
  return {
    translation: r.translation.slice(0, 80),
    partOfSpeech: r.partOfSpeech?.slice(0, 30),
    example: r.example?.slice(0, 120),
  };
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

function parseBatchResponse(raw: string, words: string[]): Map<string, TranslationResult> {
  const map = new Map<string, TranslationResult>();
  const parsed = extractJson(raw) as Record<string, unknown>;

  const items =
    (parsed.items as Record<string, TranslationResult> | undefined) ??
    (parsed.words as Record<string, TranslationResult> | undefined) ??
    parsed;

  for (const w of words) {
    const entry = items[w] as TranslationResult | undefined;
    if (entry?.translation) map.set(w, trimResult(entry));
  }
  return map;
}

type ChunkMap = Map<string, TranslationResult>;
const chunkCache = new Map<string, ChunkMap>();
const chunkInflight = new Map<string, Promise<ChunkMap>>();

/** One API call per sentence — all words cached for instant re-taps. */
async function loadChunkTranslations(
  apiKey: string,
  context: string,
  model: string,
): Promise<ChunkMap> {
  const ctxKey = context.trim();
  const cached = chunkCache.get(ctxKey);
  if (cached) return cached;

  const pending = chunkInflight.get(ctxKey);
  if (pending) return pending;

  const words = wordsInSentence(context);
  if (words.length === 0) return new Map();

  const promise = (async () => {
    const prompt = `English sentence: "${context}"
For EACH word below, give a BRIEF Russian translation (1-3 words max, no sentences).
Words: ${words.join(", ")}
JSON only: {"items":{"word":{"translation":"...","partOfSpeech":"noun|verb|...","example":"short phrase"}}}`;

    const raw = await callWithFallback(apiKey, model, prompt);
    const map = parseBatchResponse(raw, words);

    // Fallback for words missing from batch
    for (const w of words) {
      if (map.has(w)) continue;
      try {
        const singleRaw = await callWithFallback(
          apiKey,
          model,
          `Word "${w}" in "${context}" → brief Russian (1-3 words). JSON: {"translation":"...","partOfSpeech":"...","example":"..."}`,
        );
        const single = extractJson(singleRaw) as TranslationResult;
        if (single.translation) map.set(w, trimResult(single));
      } catch {
        // skip
      }
    }

    chunkCache.set(ctxKey, map);
    return map;
  })().finally(() => chunkInflight.delete(ctxKey));

  chunkInflight.set(ctxKey, promise);
  return promise;
}

/** Warm cache when chunk appears — first tap is faster. */
export function prefetchChunkTranslations(
  apiKey: string,
  context: string,
  model = DEFAULT_MODEL,
): void {
  if (!context.trim() || !apiKey) return;
  loadChunkTranslations(apiKey, context, model).catch(() => {});
}

export async function translateWord(
  apiKey: string,
  word: string,
  context: string,
  model = DEFAULT_MODEL,
): Promise<TranslationResult> {
  const wKey = normalizeWord(word);
  if (!wKey) throw new Error("Empty word");

  const map = await loadChunkTranslations(apiKey, context, model);
  const hit = map.get(wKey);
  if (hit) return hit;

  // Word not in sentence tokens — single-word fallback
  const raw = await callWithFallback(
    apiKey,
    model,
    `Word "${word}" in "${context}" → brief Russian (1-3 words). JSON: {"translation":"...","partOfSpeech":"...","example":"..."}`,
  );
  const single = trimResult(extractJson(raw) as TranslationResult);
  if (!single.translation) throw new Error("Invalid translation response");
  return single;
}

export async function testApiKey(
  apiKey: string,
  model = DEFAULT_MODEL,
): Promise<boolean> {
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
