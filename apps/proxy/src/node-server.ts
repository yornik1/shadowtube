/**
 * Local dev server (Node.js) — fetches YouTube captions for the mobile app.
 * Run: pnpm dev:node
 *
 * The HTTP handler is exported separately so it can be imported in tests
 * without starting a real server.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { YoutubeTranscript } from "youtube-transcript";
import { Innertube } from "youtubei.js";

export const PORT = Number(process.env.PORT ?? 8787);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// Вне репозитория: apps/proxy/dev.log ломал Metro (watchFolders monorepo)
// → бесконечная пересборка и «скачивание» в Expo Go.
const LOG_FILE = path.join(os.tmpdir(), "shadowtube-dev.log");
const LOG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB ротейтим, чтобы файл не пух

type LogEntry = { level?: string; ts?: number; msg?: string; tag?: string };

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function appendLog(entries: LogEntry[]): void {
  const lines = entries.map((e) => {
    const ts = new Date(e.ts ?? Date.now()).toISOString();
    const lvl = (e.level ?? "log").toUpperCase().padEnd(5);
    const tag = e.tag ? ` [${e.tag}]` : "";
    return `${ts} ${lvl}${tag} ${e.msg ?? ""}`;
  });
  // ротация: если перевалили лимит — переименовываем в .1 и начинаем новый
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + ".1");
    }
  } catch {
    /* файла нет — ок */
  }
  fs.appendFileSync(LOG_FILE, lines.join("\n") + "\n");
  for (const line of lines) {
    console.log(`[mobile] ${line}`);
  }
}

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
    // dev-логи с устройства: POST [{level,ts,msg,tag}, ...] → append в файл
    if (req.method === "POST" && url.pathname === "/log") {
      const body = await readJsonBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ error: "invalid json" }));
        return;
      }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      appendLog(entries as LogEntry[]);
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/log") {
      try {
        fs.rmSync(LOG_FILE, { force: true });
        fs.rmSync(LOG_FILE + ".1", { force: true });
      } catch {
        /* игнор */
      }
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (url.pathname === "/log/tail") {
      const n = Number(url.searchParams.get("n") ?? 200);
      let content = "";
      try {
        content = fs.readFileSync(LOG_FILE, "utf8");
      } catch {
        /* нет файла */
      }
      const tail = content.split("\n").slice(-n).join("\n");
      res.writeHead(200, { ...CORS, "Content-Type": "text/plain" });
      res.end(tail);
      return;
    }

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
      console.log(`Dev logs → ${LOG_FILE}  (tail -f "${LOG_FILE}")`);
      resolve(server);
    });
  });
}

// Run when executed directly (not during tests)
if (!process.env.VITEST) {
  startServer(PORT);
}
