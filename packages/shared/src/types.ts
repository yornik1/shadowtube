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

/** Что за конструкция выделена — влияет только на подпись в UI. */
export type PhraseKind = "idiom" | "phrasal" | "collocation" | "plain";

/**
 * Перевод выделенного отрезка В КОНТЕКСТЕ чанка.
 *
 * `definitionEn` запрашивается сразу вместе с переводом — режим карточки
 * «толковый словарь» не должен стоить отдельного вызова Gemini.
 */
export type PhraseTranslation = {
  /** Естественный русский — так сказал бы носитель, а не подстрочник. */
  ru: string;
  /** Дословно — только когда расходится с естественным переводом. */
  literal?: string;
  /** Английское определение простыми словами (уровень B1). */
  definitionEn: string;
  /** Почему это идиома / что тут неочевидного. */
  note?: string;
  kind: PhraseKind;
};

/** Идиома/связка, найденная внутри чанка. */
export type PhraseNote = {
  span: string;
  ru: string;
  kind: PhraseKind;
};

/** Перевод целого чанка + разбор непрозрачных мест внутри него. */
export type ChunkTranslation = {
  ru: string;
  notes: PhraseNote[];
};
