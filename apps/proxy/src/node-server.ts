/**
 * Local dev server (Node.js) — fetches YouTube captions for the mobile app.
 * Run: pnpm dev:node
 *
 * The HTTP handler is exported separately so it can be imported in tests
 * without starting a real server.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { YoutubeTranscript } from "youtube-transcript";
import { Innertube } from "youtubei.js";

export const PORT = Number(process.env.PORT ?? 8787);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

type Segment = { start: number; duration: number; text: string };

export async function fetchTranscript(videoId: string, lang: string) {
  const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
  const segments: Segment[] = raw.map((item, i) => {
    const next = raw[i + 1];
    const start = item.offset / 1000;
    const end = next ? next.offset / 1000 : start + 3;
    return {
      start,
      duration: Math.max(end - start, 0.1),
      text: item.text.trim(),
    };
  });

  const filtered = segments.filter((s) => s.text.length > 0);
  if (filtered.length === 0) throw new Error("Empty transcript");

  return {
    segments: filtered,
    hasManualCaptions: false,
    language: lang,
  };
}

export async function fetchMetadata(videoId: string) {
  const innertube = await Innertube.create();
  const info = await innertube.getInfo(videoId);
  const bi = info.basic_info;
  return {
    title: bi.title ?? "Unknown",
    channel: bi.author ?? "Unknown",
    durationSec: bi.duration ?? 0,
    thumbnail:
      bi.thumbnail?.[0]?.url ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/transcript") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ error: "videoId required" }));
        return;
      }
      const lang = url.searchParams.get("lang") ?? "en";
      const data = await fetchTranscript(videoId, lang);
      res.writeHead(200, CORS);
      res.end(JSON.stringify(data));
      return;
    }

    if (url.pathname === "/metadata") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ error: "videoId required" }));
        return;
      }
      const data = await fetchMetadata(videoId);
      res.writeHead(200, CORS);
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(200, CORS);
    res.end(
      JSON.stringify({
        ok: true,
        server: "node",
        endpoints: ["/transcript?videoId=", "/metadata?videoId="],
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    res.writeHead(404, CORS);
    res.end(JSON.stringify({ error: msg }));
  }
}

export function startServer(port = PORT) {
  const server = createServer(handleRequest);
  return new Promise<typeof server>((resolve) => {
    server.listen(port, () => {
      console.log(`ShadowTube proxy (Node) http://localhost:${port}`);
      resolve(server);
    });
  });
}

// Run when executed directly (not during tests)
if (!process.env.VITEST) {
  startServer(PORT);
}
