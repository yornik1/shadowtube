const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const CACHE_TTL_SEC = 86400;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Segment = { start: number; duration: number; text: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function parseVideoId(url: URL): string | null {
  return url.searchParams.get("videoId") ?? url.searchParams.get("v");
}

async function cachedFetch(
  cacheKey: string,
  fetcher: () => Promise<Response>,
): Promise<Response> {
  const cache = caches.default;
  const req = new Request(`https://cache.shadowtube/${cacheKey}`);
  const hit = await cache.match(req);
  if (hit) return hit;

  const fresh = await fetcher();
  const body = await fresh.clone().arrayBuffer();
  const cached = new Response(body, {
    status: fresh.status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": `public, max-age=${CACHE_TTL_SEC}`,
    },
  });
  await cache.put(req, cached.clone());
  return cached;
}

function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script)/s,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        return JSON.parse(m[1]) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
  }
  return null;
}

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function pickCaptionTrack(
  tracks: CaptionTrack[],
  lang: string,
): CaptionTrack | undefined {
  const langBase = lang.split("-")[0] ?? lang;
  const asr = tracks.find(
    (t) =>
      (t.languageCode === lang || t.languageCode?.startsWith(langBase)) &&
      t.kind === "asr",
  );
  if (asr) return asr;
  return (
    tracks.find((t) => t.languageCode === lang) ??
    tracks.find((t) => t.languageCode?.startsWith(langBase)) ??
    tracks[0]
  );
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ");
}

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
};

function parseJson3(raw: string): Segment[] {
  try {
    const data = JSON.parse(raw) as { events?: Json3Event[] };
    const segments: Segment[] = [];
    for (const ev of data.events ?? []) {
      const text = (ev.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (!text) continue;
      const start = (ev.tStartMs ?? 0) / 1000;
      const duration = Math.max((ev.dDurationMs ?? 2000) / 1000, 0.1);
      segments.push({ start, duration, text });
    }
    return segments;
  } catch {
    return [];
  }
}

function parseTimedTextXml(xml: string): Segment[] {
  const segments: Segment[] = [];
  const re = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1] ?? "0");
    const duration = parseFloat(m[2] ?? "2");
    const text = decodeXmlEntities(m[3] ?? "").trim();
    if (text) {
      segments.push({ start, duration: duration || 2, text });
    }
  }
  return segments;
}

async function fetchWatchPage(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  return res.text();
}

async function fetchTranscript(
  videoId: string,
  lang: string,
): Promise<{
  segments: Segment[];
  hasManualCaptions: boolean;
  language: string;
}> {
  const html = await fetchWatchPage(videoId);
  const player = extractPlayerResponse(html);
  if (!player) throw new Error("Could not parse YouTube player data");

  const captions = player.captions as
    | {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: CaptionTrack[];
        };
      }
    | undefined;

  const tracks =
    captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    throw new Error("No captions available for this video");
  }

  const track = pickCaptionTrack(tracks, lang);
  if (!track?.baseUrl) throw new Error("Caption track URL not found");

  const separator = track.baseUrl.includes("?") ? "&" : "?";
  const jsonUrl = `${track.baseUrl}${separator}fmt=json3`;

  const capRes = await fetch(jsonUrl, { headers: { "User-Agent": UA } });
  if (!capRes.ok) throw new Error(`Caption fetch failed: ${capRes.status}`);

  const raw = await capRes.text();
  let segments = parseJson3(raw);

  if (segments.length === 0) {
    const xmlRes = await fetch(track.baseUrl, {
      headers: { "User-Agent": UA },
    });
    const xml = await xmlRes.text();
    segments = parseTimedTextXml(xml);
  }

  if (segments.length === 0 && raw.includes("WEBVTT")) {
    segments = parseVtt(raw);
  }

  if (segments.length === 0) throw new Error("Empty transcript");

  return {
    segments,
    hasManualCaptions: track.kind !== "asr",
    language: track.languageCode ?? lang,
  };
}

function parseVtt(vtt: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = vtt.split(/\n\n+/);
  const timeRe =
    /(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}/;

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => timeRe.test(l));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
    const start = parseVttTime(startStr ?? "0");
    const end = parseVttTime(endStr ?? "0");
    const text = lines
      .filter((l) => !timeRe.test(l) && !/^\d+$/.test(l))
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) {
      segments.push({
        start,
        duration: Math.max(end - start, 0.1),
        text,
      });
    }
  }
  return segments;
}

function parseVttTime(t: string): number {
  const parts = t.trim().split(":").map(Number);
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return Number(t) || 0;
}

async function fetchMetadata(videoId: string) {
  const html = await fetchWatchPage(videoId);
  const player = extractPlayerResponse(html);
  if (!player) throw new Error("Could not parse YouTube player data");

  const details = player.videoDetails as
    | {
        title?: string;
        author?: string;
        lengthSeconds?: string;
        thumbnail?: { thumbnails?: { url?: string }[] };
      }
    | undefined;

  if (!details?.title) throw new Error("Video metadata not found");

  const thumbs = details.thumbnail?.thumbnails ?? [];
  const thumbnail = thumbs[thumbs.length - 1]?.url ?? "";

  return {
    title: details.title,
    channel: details.author ?? "Unknown",
    durationSec: Number(details.lengthSeconds ?? 0),
    thumbnail:
      thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return corsPreflight();

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/transcript" || path === "/transcript/") {
        const videoId = parseVideoId(url);
        if (!videoId) return json({ error: "videoId required" }, 400);
        const lang = url.searchParams.get("lang") ?? "en";

        return cachedFetch(`transcript:${videoId}:${lang}`, async () => {
          try {
            const data = await fetchTranscript(videoId, lang);
            return json(data);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Transcript error";
            return json({ error: msg }, 404);
          }
        });
      }

      if (path === "/metadata" || path === "/metadata/") {
        const videoId = parseVideoId(url);
        if (!videoId) return json({ error: "videoId required" }, 400);

        return cachedFetch(`metadata:${videoId}`, async () => {
          try {
            const data = await fetchMetadata(videoId);
            return json(data);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Metadata error";
            return json({ error: msg }, 404);
          }
        });
      }

      return json({
        ok: true,
        endpoints: ["/transcript?videoId=", "/metadata?videoId="],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error";
      return json({ error: msg }, 500);
    }
  },
};
