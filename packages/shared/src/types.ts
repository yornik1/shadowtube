export type TranscriptSegment = {
  start: number;
  duration: number;
  text: string;
};

export type TranscriptResponse = {
  segments: TranscriptSegment[];
  hasManualCaptions: boolean;
  language: string;
};

export type VideoMetadata = {
  title: string;
  channel: string;
  durationSec: number;
  thumbnail: string;
};

export type Chunk = {
  start: number;
  end: number;
  text: string;
};

export type TranslationResult = {
  translation: string;
  partOfSpeech?: string;
  example?: string;
};
