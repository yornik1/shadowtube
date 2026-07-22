/**
 * Чистые промпты и парсеры для Gemini — без сети, поэтому тестируются vitest.
 *
 * Ключевое отличие от старого пословного режима: модель получает ВЕСЬ чанк
 * как контекст и переводит выделенный отрезок целиком. Идиома («get away
 * with», «it's a stretch») переводится как единое целое, а не по словам.
 */
import type {
  ChunkAnalysis,
  ChunkTranslation,
  PhraseCandidate,
  PhraseKind,
  PhraseNote,
  PhraseTranslation,
} from "@shadowtube/shared";

const MAX_RU = 200;
const MAX_DEFINITION = 220;
const MAX_NOTE = 200;
const MAX_NOTES_PER_CHUNK = 4;
const MAX_PHRASES_PER_CHUNK = 3;

/** Сколько чанков спрашиваем за один запрос к Gemini — бюджет 250 req/day на 3ч видео (~1234 чанка). */
export const MAX_CHUNKS_PER_BATCH = 20;

const KINDS: PhraseKind[] = ["idiom", "phrasal", "collocation", "plain"];

/** Достаёт JSON из ответа: сырой, в ```-заборе или внутри болтовни модели. */
export function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // модель обернула ответ — пробуем достать
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const braces = raw.match(/\{[\s\S]*\}/);
  if (braces?.[0]) return JSON.parse(braces[0]);
  throw new Error("Could not parse model response");
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function asKind(v: unknown): PhraseKind {
  return typeof v === "string" && (KINDS as string[]).includes(v)
    ? (v as PhraseKind)
    : "plain";
}

/**
 * Ответ не-JSON'ом. Берём первую непустую строку как перевод — лучше показать
 * хоть что-то, чем «Ошибка перевода» посреди сессии.
 */
function plainTextFallback(raw: string, max: number): string | undefined {
  const line = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(перевод|translation)\s*[:：-]\s*/i, "")
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .find(Boolean);
  return line ? line.replace(/^['"]|['"]$/g, "").trim().slice(0, max) : undefined;
}

export function buildPhrasePrompt(span: string, context: string): string {
  return `You are helping a Russian speaker (B2) shadow English video.

Full sentence from the video: "${context}"
Selected fragment: "${span}"

Translate the SELECTED FRAGMENT AS A WHOLE, in the meaning it has in this sentence.
Never translate it word by word — if it is an idiom, phrasal verb or fixed
collocation, give the meaning a native speaker hears.

Reply with JSON only:
{
  "ru": "natural Russian translation of the fragment (not the whole sentence)",
  "literal": "word-by-word Russian ONLY if it differs from the natural one, else omit",
  "definitionEn": "what it means, in simple English (B1 level, max 15 words)",
  "note": "short Russian note ONLY if the fragment is non-obvious (idiom, slang, grammar trick), else omit",
  "kind": "idiom" | "phrasal" | "collocation" | "plain"
}`;
}

export function parsePhraseResponse(raw: string, span: string): PhraseTranslation {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    const ru = plainTextFallback(raw, MAX_RU);
    if (!ru) throw new Error("Could not parse translation response");
    return { ru, definitionEn: "", kind: "plain" };
  }

  const ru =
    str(parsed.ru, MAX_RU) ??
    str(parsed.translation, MAX_RU) ??
    plainTextFallback(raw, MAX_RU);
  if (!ru) throw new Error("Could not parse translation response");

  const literal = str(parsed.literal, MAX_RU);

  return {
    ru,
    // Дословный перевод, совпадающий с обычным, — визуальный шум.
    literal: literal && literal !== ru ? literal : undefined,
    definitionEn: str(parsed.definitionEn, MAX_DEFINITION) ?? "",
    note: str(parsed.note, MAX_NOTE),
    kind: asKind(parsed.kind),
  };
}

export function buildChunkPrompt(text: string): string {
  return `Translate this English sentence into natural Russian for a B2 learner.

Sentence: "${text}"

Then list up to ${MAX_NOTES_PER_CHUNK} fragments inside it that a Russian speaker
would NOT understand by translating word by word (idioms, phrasal verbs, fixed
collocations). If everything is literal, return an empty list.

JSON only:
{"ru":"...","notes":[{"span":"exact fragment from the sentence","ru":"...","kind":"idiom"}]}`;
}

export function parseChunkResponse(raw: string): ChunkTranslation {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = extractJson(raw) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    const ru = plainTextFallback(raw, MAX_RU * 2);
    if (!ru) throw new Error("Could not parse chunk translation");
    return { ru, notes: [] };
  }

  const ru = str(parsed.ru, MAX_RU * 2) ?? str(parsed.translation, MAX_RU * 2);
  if (!ru) throw new Error("Could not parse chunk translation");

  const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
  const notes: PhraseNote[] = [];
  for (const n of rawNotes) {
    if (!n || typeof n !== "object") continue;
    const item = n as Record<string, unknown>;
    const span = str(item.span, 80);
    const noteRu = str(item.ru, MAX_RU);
    if (!span || !noteRu) continue;
    notes.push({ span, ru: noteRu, kind: asKind(item.kind) });
    if (notes.length >= MAX_NOTES_PER_CHUNK) break;
  }

  return { ru, notes };
}

/** worth должен быть числом 1..5 — модель иногда шлёт 0, 99 или строку. */
function clampWorth(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Пакетный промпт: до MAX_CHUNKS_PER_BATCH чанков за один вызов Gemini.
 * Бесплатный тариф — 250 запросов/день, а 3-часовое видео даёт ~1234 чанка,
 * поэтому по одному чанку за запрос бюджета не хватит даже на одно видео.
 */
export function buildBatchPrompt(chunks: { idx: number; text: string }[]): string {
  const list = chunks.map((c) => `[${c.idx}] ${c.text}`).join("\n");
  return `You are helping a Russian speaker (B2) who is preparing for English job
interviews. For EACH numbered chunk below, do two things:

1. Give a natural Russian translation of the WHOLE chunk (not word-by-word).
2. Pick 0-3 phrases from that chunk worth memorising as flashcards.

Chunks:
${list}

PHRASE SELECTION: prefer idioms, phrasal verbs and fixed collocations over a
single transparent word — a lone word like "important" is never worth a
card. If a chunk has nothing worth learning, return an empty "phrases" list
for it — that is a valid, expected answer. Never invent a phrase just to
fill the list.

SPAN CLEANUP — critical. These chunks come from auto-generated captions cut
mid-sentence, so raw substrings are often broken: doubled hyphens, speaker
dashes, a fragment spilling into the next sentence. A phrase "span" must be
a CLEAN, self-contained flashcard form — never copy a broken substring as
is, and never let it run across a sentence boundary.
Bad span (do NOT do this): "figure out- - That's" (doubled hyphen, spills
into the next sentence). Cleaned form: "figure out".
Strip stray dashes, leading/trailing conjunctions ("and", "but", "so"), and
speaker-turn dashes before returning a span.

For each phrase also give:
- "worth": 1-5, how much a B2 learner preparing for interviews would gain
  from memorising it. 5 = genuinely useful and reusable in an interview,
  1 = trivially transparent (such phrases should basically never be returned).
- "definitionEn": simple B1 English, max ~15 words.
- "kind": "idiom" | "phrasal" | "collocation" | "plain".

Output strict JSON only, no commentary, shaped exactly like this:
{"chunks":[{"idx":0,"ru":"...","phrases":[{"span":"...","ru":"...","definitionEn":"...","kind":"idiom","worth":4}]}]}`;
}

/**
 * Терпимый парсер пакетного ответа. Один битый чанк не должен ронять весь
 * батч — пропускаем его и возвращаем остальные (`ru` для остальных чанков
 * уже стоило вызова Gemini, выбрасывать всё жалко).
 */
export function parseBatchResponse(raw: string, requestedIdx: number[]): ChunkAnalysis[] {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return [];
  }

  const rawChunks = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown> | null)?.chunks)
      ? (parsed as Record<string, unknown>).chunks
      : null;
  if (!Array.isArray(rawChunks)) return [];

  const allowedIdx = new Set(requestedIdx);
  const results: ChunkAnalysis[] = [];

  for (const c of rawChunks) {
    try {
      if (!c || typeof c !== "object") continue;
      const item = c as Record<string, unknown>;
      const idx = typeof item.idx === "number" ? item.idx : undefined;
      if (idx === undefined || !allowedIdx.has(idx)) continue;

      const ru = str(item.ru, MAX_RU * 2);
      if (!ru) continue;

      const rawPhrases = Array.isArray(item.phrases) ? item.phrases : [];
      const phrases: PhraseCandidate[] = [];
      for (const p of rawPhrases) {
        if (!p || typeof p !== "object") continue;
        const ph = p as Record<string, unknown>;
        const span = str(ph.span, 80);
        const phraseRu = str(ph.ru, MAX_RU);
        if (!span || !phraseRu) continue;
        phrases.push({
          span,
          ru: phraseRu,
          definitionEn: str(ph.definitionEn, MAX_DEFINITION) ?? "",
          kind: asKind(ph.kind),
          worth: clampWorth(ph.worth),
        });
        if (phrases.length >= MAX_PHRASES_PER_CHUNK) break;
      }

      results.push({ chunkIdx: idx, ru, phrases });
    } catch {
      // сломанный чанк пропускаем, остальные всё равно годны
      continue;
    }
  }

  return results;
}
