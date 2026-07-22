/**
 * Интервальные повторения — FSRS (Free Spaced Repetition Scheduler) вместо SM-2.
 *
 * SM-2 остаётся в ./sm2.ts как путь отката. Здесь тот же трёхоценочный
 * вокабуляр UI ("не помню" / "трудно" / "легко"), но само планирование
 * считает библиотека ts-fsrs — она моделирует стабильность/сложность
 * памяти вместо простого множителя интервала (easiness factor).
 *
 * `now` — параметр с default, как и в sm2.ts → тестируемо без реальных часов.
 */

import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade as FsrsRating,
} from "ts-fsrs";

export { formatDue } from "./sm2";

export type Grade = "again" | "hard" | "easy";

/**
 * "easy" → Rating.Good, а НЕ Rating.Easy.
 *
 * В FSRS Rating.Easy — отдельная, четвёртая оценка с большим бонусным
 * множителем интервала ("совсем не напрягался, катапультируй карточку
 * далеко вперёд"). У нас в UI только три кнопки, и "легко" означает обычный
 * успешный ответ — то есть Rating.Good. Если смапить "easy" → Rating.Easy,
 * интервалы после нескольких подряд "легко" будут расти неоправданно
 * быстро — карточка выпадет из практики на месяцы после пары повторений.
 */
const GRADE_TO_RATING: Record<Grade, FsrsRating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  easy: Rating.Good,
};

export const DEFAULT_RETENTION = 0.9;

/**
 * enable_short_term: false — отключаем под-дневные шаги обучения (1м/10м).
 *
 * По умолчанию ts-fsrs после первой оценки держит карточку в State.Learning
 * с интервалом в минутах: scheduledDays первые одно-два повторения будет 0,
 * а due — через несколько минут. Наше приложение показывает повторения не
 * чаще раза в день (listDue сравнивает dueAt с `now`), так что суб-дневная
 * стадия только мешает — карточка «созревала» бы несколько раз за одну
 * сессию. С enable_short_term: false планирование сразу идёт в днях.
 */
const scheduler = fsrs({
  request_retention: DEFAULT_RETENTION,
  enable_short_term: false,
});

/** Поля карточки в БД, нужные FSRS. Независимо от drizzle-схемы — как CardSrs в sm2.ts. */
export type CardFsrs = {
  stability: number | null;
  difficulty: number | null;
  fsrsState: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
};

export type FsrsOutcome = {
  stability: number;
  difficulty: number;
  fsrsState: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date;
  /** Округлённые scheduledDays — чтобы старый UI (список словаря) не менять. */
  intervalDays: number;
};

/**
 * DB-строка → Card для ts-fsrs.
 *
 * `stability`/`difficulty` пустые — карточка либо только что создана, либо
 * пришла из SM-2 (легаси-колонки заполнены, FSRS-колонки — нет). В обоих
 * случаях считаем её новой для FSRS: createEmptyCard() даёт корректное
 * начальное состояние (State.New, нулевые stability/difficulty), поверх
 * которого сохраняем уже накопленные счётчики и даты, если они есть —
 * это не ломает алгоритм (State.New игнорирует прошлый elapsed-time), но
 * не теряет историю карточки.
 */
export function toFsrsCard(row: CardFsrs): Card {
  if (row.stability == null || row.difficulty == null) {
    const card = createEmptyCard(row.lastReviewedAt ?? new Date());
    card.reps = row.reps;
    card.lapses = row.lapses;
    if (row.dueAt) card.due = row.dueAt;
    if (row.lastReviewedAt) card.last_review = row.lastReviewedAt;
    return card;
  }

  return {
    due: row.dueAt ?? new Date(),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.fsrsState as State,
    last_review: row.lastReviewedAt ?? undefined,
  };
}

/** Оценка → новое состояние карточки, готовое к записи в БД. */
export function nextReview(
  row: CardFsrs,
  grade: Grade,
  now: Date = new Date(),
): FsrsOutcome {
  const card = toFsrsCard(row);
  const { card: next } = scheduler.next(card, now, GRADE_TO_RATING[grade]);

  return {
    stability: next.stability,
    difficulty: next.difficulty,
    fsrsState: next.state,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    dueAt: next.due,
    lastReviewedAt: next.last_review ?? now,
    intervalDays: Math.round(next.scheduled_days),
  };
}
