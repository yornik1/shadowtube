/**
 * Интервальные повторения — SM-2 на трёх оценках вместо шести.
 *
 * Шесть градаций из оригинального SuperMemo заставляют оценивать себя по шкале,
 * в которой человек всё равно путается. Anki по факту свёл это к «забыл /
 * трудно / легко» — берём тот же набор.
 *
 * Функция чистая, `now` приходит параметром → полностью тестируема.
 */

export type Grade = "again" | "hard" | "easy";

export type CardSrs = {
  /** Easiness factor из SM-2: во сколько раз растёт интервал. */
  ef: number;
  intervalDays: number;
  /** Сколько раз подряд вспомнили. Сброс до 0 при «не помню». */
  reps: number;
  lapses: number;
};

export type ReviewOutcome = CardSrs & {
  dueAt: Date;
  lastReviewedAt: Date;
};

/** Ниже 1.3 интервалы перестают расти — граница из оригинального SM-2. */
export const MIN_EF = 1.3;
export const MAX_EF = 3.0;
export const DEFAULT_EF = 2.5;

const DAY_MS = 24 * 60 * 60 * 1000;

const EF_DELTA: Record<Grade, number> = {
  again: -0.2,
  hard: -0.15,
  easy: +0.1,
};

function clampEf(ef: number): number {
  const bounded = Math.min(MAX_EF, Math.max(MIN_EF, ef));
  // Без округления ef накапливает хвост из плавающей точки (2.3000000000000003).
  return Math.round(bounded * 100) / 100;
}

function nextInterval(card: CardSrs, grade: Grade, ef: number): number {
  if (grade === "again") return 0;

  if (grade === "hard") {
    // Карточку помним, но с трудом — растим интервал медленнее, чем на ef.
    return card.reps === 0 ? 1 : Math.max(1, Math.round(card.intervalDays * 1.2));
  }

  // easy — классическая лестница SM-2.
  if (card.reps === 0) return 1;
  if (card.reps === 1) return 6;
  return Math.max(1, Math.round(card.intervalDays * ef));
}

export function nextReview(
  card: CardSrs,
  grade: Grade,
  now: Date = new Date(),
): ReviewOutcome {
  const ef = clampEf((card.ef || DEFAULT_EF) + EF_DELTA[grade]);
  const intervalDays = nextInterval(card, grade, ef);

  return {
    ef,
    intervalDays,
    // «Не помню» обнуляет серию: карточка снова проходит путь с начала.
    reps: grade === "again" ? 0 : card.reps + 1,
    lapses: grade === "again" ? card.lapses + 1 : card.lapses,
    // intervalDays = 0 → карточка сразу снова в очереди этой же сессии.
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    lastReviewedAt: now,
  };
}

/** Подпись «когда снова» для списка словаря. */
export function formatDue(dueAt: Date | null, now: Date = new Date()): string {
  if (!dueAt) return "новая";

  const diffDays = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS);
  if (diffDays <= 0) return "сегодня";
  if (diffDays === 1) return "завтра";
  if (diffDays < 5) return `через ${diffDays} дня`;
  if (diffDays < 30) return `через ${diffDays} дней`;

  const months = Math.round(diffDays / 30);
  return months === 1 ? "через месяц" : `через ${months} мес.`;
}
