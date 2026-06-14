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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  let directError: unknown;
  try {
    return await fetchDirectTranscript(videoId, lang);
  } catch (error) {
    directError = error;
    // Fallback keeps old APK/dev behavior while direct mobile extraction matures.
  }

  try {
    return await get<TranscriptResponse>("/transcript", { videoId, lang });
  } catch (proxyError) {
    throw new Error(
      `Direct YouTube captions failed: ${errorMessage(directError)}\n\nProxy fallback failed: ${errorMessage(proxyError)}`,
    );
  }
}

export async function fetchMetadata(videoId: string): Promise<VideoMetadata> {
  let directError: unknown;
  try {
    return await fetchDirectMetadata(videoId);
  } catch (error) {
    directError = error;
    // Metadata is also available from the proxy for legacy/dev fallback.
  }

  try {
    return await get<VideoMetadata>("/metadata", { videoId });
  } catch (proxyError) {
    throw new Error(
      `Direct YouTube metadata failed: ${errorMessage(directError)}\n\nProxy fallback failed: ${errorMessage(proxyError)}`,
    );
  }
}
