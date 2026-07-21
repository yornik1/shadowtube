/**
 * Режимы карточки повторения.
 *
 * Одна и та же запись словаря показывается по-разному в зависимости от того,
 * что человек тренирует: сказать фразу самому (продакшн), узнать её в речи
 * или понять определение без русского вообще.
 *
 * Интервалы SM-2 общие для всех режимов: запись одна, меняется только подача,
 * иначе очередь раздувалась бы втрое.
 */

export type CardMode = "ru_to_en" | "en_to_ru" | "en_to_en";

export const DEFAULT_CARD_MODE: CardMode = "ru_to_en";

export const CARD_MODES: {
  id: CardMode;
  title: string;
  hint: string;
}[] = [
  {
    id: "ru_to_en",
    title: "Русский → английский",
    hint: "Видишь перевод — говоришь фразу вслух. Тренирует речь.",
  },
  {
    id: "en_to_ru",
    title: "Английский → русский",
    hint: "Видишь фразу — вспоминаешь значение. Легче, тренирует узнавание.",
  },
  {
    id: "en_to_en",
    title: "Толковый словарь",
    hint: "Английское определение вместо перевода. Русский — по кнопке.",
  },
];

export function isCardMode(v: unknown): v is CardMode {
  return v === "ru_to_en" || v === "en_to_ru" || v === "en_to_en";
}

/** Минимум полей записи, нужный для показа карточки. */
export type CardSource = {
  /** Английская сторона. */
  word: string;
  translation: string;
  definitionEn?: string | null;
  context?: string | null;
};

export type CardFace = {
  /** Что показываем до раскрытия. */
  front: string;
  /** Подсказка, что вообще нужно сделать. */
  prompt: string;
  /** Ответ. */
  back: string;
  /** Второстепенная строка под ответом (предложение или перевод). */
  backSecondary?: string;
  /** Русский, спрятанный за кнопкой «не понял» (только толковый режим). */
  fallbackRu?: string;
};

export function buildCard(entry: CardSource, mode: CardMode): CardFace {
  const context = entry.context?.trim() || undefined;
  const definition = entry.definitionEn?.trim() || "";

  if (mode === "en_to_ru") {
    return {
      front: entry.word,
      prompt: "Что это значит?",
      back: entry.translation,
      backSecondary: context,
    };
  }

  if (mode === "en_to_en") {
    // Записи, сохранённые до фразового режима, определения не имеют —
    // молча откатываемся на перевод, а не показываем пустую карточку.
    return definition
      ? {
          front: entry.word,
          prompt: "Объясни своими словами",
          back: definition,
          backSecondary: context,
          fallbackRu: entry.translation,
        }
      : {
          front: entry.word,
          prompt: "Что это значит?",
          back: entry.translation,
          backSecondary: context,
        };
  }

  return {
    front: entry.translation,
    prompt: "Скажи вслух по-английски",
    back: entry.word,
    backSecondary: context,
  };
}
