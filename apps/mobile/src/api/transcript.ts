import type { TranscriptResponse, VideoMetadata } from "@shadowtube/shared";
import { getProxyCandidates } from "./proxyConfig";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const errors: string[] = [];
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
        throw new Error(err.error ?? `Request failed: ${res.status}`);
      }
      return res.json() as Promise<T>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${baseUrl}: ${msg}`);
    }
  }

  throw new Error(`Proxy unreachable. Tried: ${errors.join("; ")}`);
}

export async function fetchTranscript(
  videoId: string,
  lang = "en",
): Promise<TranscriptResponse> {
  return get<TranscriptResponse>("/transcript", { videoId, lang });
}

export async function fetchMetadata(videoId: string): Promise<VideoMetadata> {
  return get<VideoMetadata>("/metadata", { videoId });
}
