import type { TranscriptSegment, Chunk } from "@shadowtube/shared";

export type ChunkerOptions = {
  minSec?: number;
  maxSec?: number;
  pauseSec?: number;
  punctuationThreshold?: number;
};

const DEFAULT_OPTS: Required<ChunkerOptions> = {
  minSec: 1.5,
  maxSec: 15,
  pauseSec: 0.5,
  punctuationThreshold: 0.15,
};

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "u.s",
  "u.k",
  "a.m",
  "p.m",
]);

function segmentEnd(seg: TranscriptSegment): number {
  return seg.start + seg.duration;
}

function hasPunctuation(segments: TranscriptSegment[], threshold: number): boolean {
  if (segments.length === 0) return false;
  const withPunct = segments.filter((s) => /[.!?]/.test(s.text)).length;
  return withPunct / segments.length >= threshold;
}

function isAbbreviationBeforeDot(text: string, dotIndex: number): boolean {
  const before = text.slice(0, dotIndex).trimEnd();
  const match = before.match(/([A-Za-z][A-Za-z.]*)\s*$/);
  if (!match) return false;
  const word = match[1].replace(/\./g, "").toLowerCase();
  return ABBREVIATIONS.has(word);
}

function findSentenceBoundaries(fullText: string): number[] {
  const boundaries: number[] = [];
  const regex = /[.!?]+(\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fullText)) !== null) {
    const endIdx = match.index + match[0].length;
    const dotIdx = match.index;
    if (!isAbbreviationBeforeDot(fullText, dotIdx)) {
      boundaries.push(endIdx);
    }
  }
  if (boundaries.length === 0 && fullText.trim()) {
    boundaries.push(fullText.length);
  }
  return boundaries;
}

type CharMap = { segIndex: number; segStart: number; segEnd: number };

function buildCharMap(segments: TranscriptSegment[]): {
  fullText: string;
  map: CharMap[];
} {
  let fullText = "";
  const map: CharMap[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const piece = seg.text;
    if (i > 0 && !fullText.endsWith(" ") && !piece.startsWith(" ")) {
      fullText += " ";
      map.push({
        segIndex: i,
        segStart: seg.start,
        segEnd: segmentEnd(seg),
      });
    }
    for (let c = 0; c < piece.length; c++) {
      map.push({
        segIndex: i,
        segStart: seg.start,
        segEnd: segmentEnd(seg),
      });
    }
    fullText += piece;
  }
  return { fullText, map };
}

function chunkBySentences(segments: TranscriptSegment[]): Chunk[] {
  const { fullText, map } = buildCharMap(segments);
  const boundaries = findSentenceBoundaries(fullText);
  const chunks: Chunk[] = [];
  let prev = 0;

  for (const endChar of boundaries) {
    const slice = fullText.slice(prev, endChar).trim();
    if (!slice || prev >= map.length) {
      prev = endChar;
      continue;
    }
    const startMap = map[prev] ?? map[0]!;
    const endIdx = Math.min(endChar - 1, map.length - 1);
    const endMap = map[endIdx] ?? startMap;
    chunks.push({
      start: startMap.segStart,
      end: endMap.segEnd,
      text: slice,
    });
    prev = endChar;
  }

  if (prev < fullText.length) {
    const slice = fullText.slice(prev).trim();
    if (slice) {
      const startMap = map[prev] ?? map[map.length - 1]!;
      const endMap = map[map.length - 1]!;
      chunks.push({
        start: startMap.segStart,
        end: endMap.segEnd,
        text: slice,
      });
    }
  }

  return chunks;
}

function chunkByPauses(
  segments: TranscriptSegment[],
  pauseSec: number,
): Chunk[] {
  if (segments.length === 0) return [];
  const chunks: Chunk[] = [];
  let groupStart = 0;

  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    const gap =
      i < segments.length - 1
        ? segments[i + 1]!.start - segmentEnd(segments[i]!)
        : 0;
    const boundary = isLast || gap > pauseSec;

    if (boundary) {
      const slice = segments.slice(groupStart, i + 1);
      const text = slice.map((s) => s.text).join(" ").trim();
      if (text) {
        chunks.push({
          start: slice[0]!.start,
          end: segmentEnd(slice[slice.length - 1]!),
          text,
        });
      }
      groupStart = i + 1;
    }
  }

  return chunks;
}

function mergeShortChunks(chunks: Chunk[], minSec: number): Chunk[] {
  if (chunks.length <= 1) return chunks;
  const result: Chunk[] = [];
  let pending: Chunk | null = null;

  for (const c of chunks) {
    const duration = c.end - c.start;
    if (pending) {
      pending = {
        start: pending.start,
        end: c.end,
        text: `${pending.text} ${c.text}`.trim(),
      };
      if (pending.end - pending.start >= minSec) {
        result.push(pending);
        pending = null;
      }
    } else if (duration < minSec) {
      pending = { ...c };
    } else {
      result.push(c);
    }
  }

  if (pending) {
    if (result.length > 0) {
      const last = result[result.length - 1]!;
      result[result.length - 1] = {
        start: last.start,
        end: pending.end,
        text: `${last.text} ${pending.text}`.trim(),
      };
    } else {
      result.push(pending);
    }
  }

  return result;
}

/** Prevent chunk N end from bleeding into chunk N+1 (caption duration vs speech). */
function clampChunkEnds(chunks: Chunk[]): Chunk[] {
  if (chunks.length <= 1) return chunks;
  return chunks.map((c, i) => {
    if (i >= chunks.length - 1) return c;
    const cap = chunks[i + 1]!.start;
    if (c.end <= cap) return c;
    return { ...c, end: cap };
  });
}

/** Group transcript segments into sentence-aware chunks (never split mid-phrase by timer). */
export function chunk(
  segments: TranscriptSegment[],
  opts?: ChunkerOptions,
): Chunk[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (segments.length === 0) return [];

  const normalized = segments
    .map((s) => ({
      ...s,
      text: s.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((s) => s.text.length > 0);

  let raw: Chunk[];
  if (hasPunctuation(normalized, o.punctuationThreshold)) {
    raw = chunkBySentences(normalized);
  } else {
    raw = chunkByPauses(normalized, o.pauseSec);
  }

  if (raw.length === 0) {
    raw = [
      {
        start: normalized[0]!.start,
        end: segmentEnd(normalized[normalized.length - 1]!),
        text: normalized.map((s) => s.text).join(" "),
      },
    ];
  }

  return clampChunkEnds(mergeShortChunks(raw, o.minSec));
}
