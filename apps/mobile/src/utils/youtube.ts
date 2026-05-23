const YT_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /^([a-zA-Z0-9_-]{11})$/,
];

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  for (const pattern of YT_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}
