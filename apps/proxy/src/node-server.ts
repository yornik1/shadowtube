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

function devLogsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_LOGS === "1";
}

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

class ProxyError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
    readonly code = "PROXY_ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

function getYoutubeCookie(): string | undefined {
  const inlineCookie = process.env.YOUTUBE_COOKIE?.trim();
  if (inlineCookie) return inlineCookie;

  const cookieFile = process.env.YOUTUBE_COOKIE_FILE?.trim();
  if (!cookieFile) return undefined;

  try {
    const fileCookie = fs.readFileSync(cookieFile, "utf8").trim();
    return fileCookie || undefined;
  } catch {
    return undefined;
  }
}

async function youtubeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const cookie = getYoutubeCookie();
  if (!cookie) return fetch(input, init);

  const headers = new Headers(init?.headers);
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("youtube.com") || host.endsWith("googlevideo.com")) {
      headers.set("Cookie", cookie);
    }
  } catch {
    /* keep original request */
  }

  return fetch(input, { ...init, headers });
}

function parseInlineJson(html: string, globalName: string): unknown | null {
  const startToken = `var ${globalName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) return null;

  const jsonStart = startIndex + startToken.length;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type CaptionTrackDebug = {
  languageCode?: string;
  name?: string;
  kind?: string;
  isTranslatable?: boolean;
};

type YoutubeDebug = {
  videoId: string;
  hasYoutubeCookie: boolean;
  htmlStatus?: number;
  playabilityStatus?: string;
  playabilityReason?: string;
  captionTracks: CaptionTrackDebug[];
  hasCaptcha: boolean;
  hasConsentPage: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function getNestedRecord(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const key of keys) {
    current = asRecord(current)?.[key];
  }
  return asRecord(current);
}

function getText(value: unknown): string | undefined {
  const record = asRecord(value);
  if (typeof record?.simpleText === "string") return record.simpleText;
  const runs = record?.runs;
  if (Array.isArray(runs)) {
    const text = runs
      .map((run) => asRecord(run)?.text)
      .filter((part): part is string => typeof part === "string")
      .join("");
    return text || undefined;
  }
  return undefined;
}

export async function inspectYoutubeVideo(videoId: string): Promise<YoutubeDebug> {
  const res = await youtubeFetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
  });
  const html = await res.text();
  const playerResponse = parseInlineJson(html, "ytInitialPlayerResponse");
  const playability = asRecord(asRecord(playerResponse)?.playabilityStatus);
  const tracklist = getNestedRecord(playerResponse, [
    "captions",
    "playerCaptionsTracklistRenderer",
  ]);
  const rawTracks = tracklist?.captionTracks;
  const captionTracks = Array.isArray(rawTracks)
    ? rawTracks.map((track) => {
        const record = asRecord(track) ?? {};
        return {
          languageCode: typeof record.languageCode === "string" ? record.languageCode : undefined,
          name: getText(record.name),
          kind: typeof record.kind === "string" ? record.kind : undefined,
          isTranslatable:
            typeof record.isTranslatable === "boolean" ? record.isTranslatable : undefined,
        };
      })
    : [];

  return {
    videoId,
    hasYoutubeCookie: Boolean(getYoutubeCookie()),
    htmlStatus: res.status,
    playabilityStatus:
      typeof playability?.status === "string" ? playability.status : undefined,
    playabilityReason:
      typeof playability?.reason === "string" ? playability.reason : undefined,
    captionTracks,
    hasCaptcha: html.includes('class="g-recaptcha"'),
    hasConsentPage: html.includes("consent.youtube.com"),
  };
}

async function classifyTranscriptError(videoId: string, error: unknown): Promise<ProxyError> {
  const message = error instanceof Error ? error.message : String(error);
  let debug: YoutubeDebug | undefined;
  try {
    debug = await inspectYoutubeVideo(videoId);
  } catch {
    /* keep original library error */
  }

  if (
    debug?.playabilityStatus === "LOGIN_REQUIRED" ||
    /sign in to confirm|not a bot|login_required/i.test(debug?.playabilityReason ?? "")
  ) {
    return new ProxyError(
      "YouTube требует вход на proxy-сервере: anonymous request получил LOGIN_REQUIRED / not-a-bot. Добавьте YOUTUBE_COOKIE для proxy или выберите видео, которое YouTube отдаёт без логина.",
      403,
      "YOUTUBE_LOGIN_REQUIRED",
      debug,
    );
  }

  if (/transcript is disabled/i.test(message)) {
    return new ProxyError(
      "Transcript is disabled or unavailable to the proxy for this video",
      404,
      "TRANSCRIPT_UNAVAILABLE",
      debug,
    );
  }

  return new ProxyError(message, 500, "TRANSCRIPT_FETCH_FAILED", debug);
}

export async function fetchTranscript(videoId: string, lang: string) {
  let raw: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoId, { lang, fetch: youtubeFetch });
  } catch (error) {
    throw await classifyTranscriptError(videoId, error);
  }
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
    if (url.pathname.startsWith("/log") && !devLogsEnabled()) {
      res.writeHead(404, CORS);
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

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

    if (url.pathname === "/debug/video") {
      const videoId = url.searchParams.get("videoId");
      if (!videoId) {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ error: "videoId required" }));
        return;
      }
      const data = await inspectYoutubeVideo(videoId);
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
        endpoints: [
          "/transcript?videoId=",
          "/metadata?videoId=",
          "/debug/video?videoId=",
        ],
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const statusCode = e instanceof ProxyError ? e.statusCode : 404;
    const code = e instanceof ProxyError ? e.code : "PROXY_ERROR";
    const details = e instanceof ProxyError ? e.details : undefined;
    res.writeHead(statusCode, CORS);
    res.end(JSON.stringify({ error: msg, code, details }));
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
