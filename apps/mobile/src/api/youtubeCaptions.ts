import type { TranscriptResponse, TranscriptSegment, VideoMetadata } from "@shadowtube/shared";

type InnerTubeClient = {
  clientName: "IOS" | "TVHTML5";
  clientVersion: string;
  userAgent: string;
};

type CaptionTrack = {
  languageCode?: string;
  kind?: string;
  baseUrl?: string;
  name?: unknown;
};

type PlayerResponse = {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: { url?: string }[] };
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
};

type Json3Transcript = {
  events?: Json3Event[];
};

const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

const INNERTUBE_CLIENTS: InnerTubeClient[] = [
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X;)",
  },
  {
    clientName: "TVHTML5",
    clientVersion: "7.20250205.16.00",
    userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
  },
];

function isLoginRequired(player: PlayerResponse): boolean {
  const status = player.playabilityStatus?.status ?? "";
  const reason = player.playabilityStatus?.reason ?? "";
  return status === "LOGIN_REQUIRED" || /sign in to confirm|not a bot/i.test(reason);
}

function textFromCaptionEvent(event: Json3Event): string {
  return (event.segs ?? [])
    .map((seg) => seg.utf8 ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJson3Transcript(json: Json3Transcript): TranscriptSegment[] {
  return (json.events ?? [])
    .map((event) => ({
      start: (event.tStartMs ?? 0) / 1000,
      duration: Math.max((event.dDurationMs ?? 0) / 1000, 0.1),
      text: textFromCaptionEvent(event),
    }))
    .filter((segment) => segment.text.length > 0);
}

function languageMatches(track: CaptionTrack, lang: string, exact: boolean): boolean {
  const code = track.languageCode?.toLowerCase();
  const wanted = lang.toLowerCase();
  if (!code) return false;
  return exact ? code === wanted : code === wanted || code.startsWith(`${wanted}-`);
}

function isAsr(track: CaptionTrack): boolean {
  return track.kind === "asr";
}

export function selectCaptionTrack(tracks: CaptionTrack[], lang: string): CaptionTrack | null {
  return (
    tracks.find((track) => languageMatches(track, lang, true) && !isAsr(track)) ??
    tracks.find((track) => languageMatches(track, lang, true)) ??
    tracks.find((track) => languageMatches(track, lang, false) && !isAsr(track)) ??
    tracks.find((track) => languageMatches(track, lang, false)) ??
    tracks.find((track) => !isAsr(track)) ??
    tracks[0] ??
    null
  );
}

function timedTextJson3Url(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

async function fetchPlayerWithClient(videoId: string, client: InnerTubeClient): Promise<PlayerResponse> {
  const res = await fetch(INNERTUBE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": client.userAgent,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: "en",
          gl: "US",
        },
      },
      videoId,
    }),
  });

  if (!res.ok) {
    throw new Error(`YouTube player request failed: ${res.status}`);
  }

  return (await res.json()) as PlayerResponse;
}

async function fetchPlayer(videoId: string): Promise<PlayerResponse> {
  let loginRequired: PlayerResponse | null = null;
  let lastError: unknown;

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const player = await fetchPlayerWithClient(videoId, client);
      const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) return player;
      if (isLoginRequired(player)) {
        loginRequired = player;
        continue;
      }
      return player;
    } catch (error) {
      lastError = error;
    }
  }

  if (loginRequired) return loginRequired;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function formatPlayerError(player: PlayerResponse): Error {
  if (isLoginRequired(player)) {
    return new Error(
      "YouTube требует вход / not-a-bot для этого видео. Прямой запрос с устройства тоже не получил captionTracks.",
    );
  }
  const status = player.playabilityStatus?.status;
  const reason = player.playabilityStatus?.reason;
  return new Error(reason || status || "YouTube не вернул captionTracks для этого видео");
}

export async function fetchDirectTranscript(
  videoId: string,
  lang = "en",
): Promise<TranscriptResponse> {
  const player = await fetchPlayer(videoId);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = selectCaptionTrack(tracks, lang);

  if (!track?.baseUrl) {
    throw formatPlayerError(player);
  }

  const res = await fetch(timedTextJson3Url(track.baseUrl), {
    headers: {
      "Accept-Language": lang,
    },
  });
  if (!res.ok) {
    throw new Error(`YouTube timedtext request failed: ${res.status}`);
  }

  const segments = parseJson3Transcript((await res.json()) as Json3Transcript);
  if (segments.length === 0) {
    throw new Error("YouTube timedtext вернул пустые субтитры");
  }

  return {
    segments,
    hasManualCaptions: !isAsr(track),
    language: track.languageCode ?? lang,
  };
}

export async function fetchDirectMetadata(videoId: string): Promise<VideoMetadata> {
  const player = await fetchPlayer(videoId);
  const details = player.videoDetails;
  if (!details) throw formatPlayerError(player);

  return {
    title: details.title ?? "Unknown",
    channel: details.author ?? "Unknown",
    durationSec: Number(details.lengthSeconds ?? 0),
    thumbnail:
      details.thumbnail?.thumbnails?.at(-1)?.url ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}
