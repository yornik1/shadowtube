import type { TranscriptResponse, VideoMetadata } from "@shadowtube/shared";
import Constants from "expo-constants";

const DEFAULT_PROXY =
  process.env.EXPO_PUBLIC_PROXY_URL ??
  "http://ec2-16-16-146-238.eu-north-1.compute.amazonaws.com:8788";

function proxyBase(): string {
  const extra = Constants.expoConfig?.extra as
    | { proxyUrl?: string }
    | undefined;
  return extra?.proxyUrl ?? DEFAULT_PROXY;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, proxyBase());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
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
