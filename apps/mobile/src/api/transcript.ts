import type { TranscriptResponse, VideoMetadata } from "@shadowtube/shared";
import { getProxyCandidates } from "./proxyConfig";
import { fetchDirectMetadata, fetchDirectTranscript } from "./youtubeCaptions";

class ProxyHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly baseUrl: string,
  ) {
    super(message);
    this.name = "ProxyHttpError";
  }
}

function formatProxyHttpError(error: ProxyHttpError): string {
  const message = error.message;
  if (/transcript is disabled|transcript disabled/i.test(message)) {
    return "У этого видео отключены или недоступны английские субтитры. Попробуйте другое видео с captions/subtitles.";
  }
  if (/empty transcript/i.test(message)) {
    return "Proxy ответил, но не нашёл непустые английские субтитры для этого видео.";
  }
  if (/videoId required/i.test(message)) {
    return "Не удалось распознать YouTube videoId.";
  }
  if (/YOUTUBE_LOGIN_REQUIRED|YouTube требует вход|not-a-bot|sign in to confirm/i.test(message)) {
    return "YouTube требует вход / not-a-bot для этого видео. Попробуйте другой ролик или direct captions с устройства/аккаунта.";
  }
  return message;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const networkErrors: string[] = [];
  const candidates = await getProxyCandidates();

  for (const baseUrl of candidates) {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ProxyHttpError(
          err.error ?? `Request failed: ${res.status}`,
          res.status,
          baseUrl,
        );
      }
      return res.json() as Promise<T>;
    } catch (e) {
      if (e instanceof ProxyHttpError) {
        throw new Error(formatProxyHttpError(e));
      }
      const msg = e instanceof Error ? e.message : String(e);
      networkErrors.push(`${baseUrl}: ${msg}`);
    }
  }

  throw new Error(`Proxy unreachable. Tried: ${networkErrors.join("; ")}`);
}

export async function fetchTranscript(
  videoId: string,
  lang = "en",
): Promise<TranscriptResponse> {
  try {
    return await fetchDirectTranscript(videoId, lang);
  } catch {
    // Fallback keeps old APK/dev behavior while direct mobile extraction matures.
  }

  return get<TranscriptResponse>("/transcript", { videoId, lang });
}

export async function fetchMetadata(videoId: string): Promise<VideoMetadata> {
  try {
    return await fetchDirectMetadata(videoId);
  } catch {
    // Metadata is also available from the proxy for legacy/dev fallback.
  }

  return get<VideoMetadata>("/metadata", { videoId });
}
