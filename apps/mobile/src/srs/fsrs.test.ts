import { describe, expect, it } from "vitest";
import { Rating, createEmptyCard, fsrs } from "ts-fsrs";

import {
  DEFAULT_RETENTION,
  nextReview,
  toFsrsCard,
  type CardFsrs,
} from "./fsrs";

const NOW = new Date("2026-07-22T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function newCard(over: Partial<CardFsrs> = {}): CardFsrs {
  return {
    stability: null,
    difficulty: null,
    fsrsState: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    dueAt: null,
    lastReviewedAt: null,
    ...over,
  };
}

describe("nextReview — new card", () => {
  it("schedules a brand-new card into the future", () => {
    const r = nextReview(newCard(), "easy", NOW);
    expect(r.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(r.scheduledDays).toBeGreaterThan(0);
    expect(r.intervalDays).toBeGreaterThan(0);
    expect(r.reps).toBe(1);
    expect(r.lastReviewedAt).toEqual(NOW);
  });
});

describe("nextReview — repeated easy grades", () => {
  it("keeps growing the interval when reviews land on schedule", () => {
    // Реальный FSRS не растит интервал при повторных вызовах с одним и тем
    // же `now` (retrievability = 1, время не прошло — расти нечему). Чтобы
    // увидеть рост, симулируем повторения строго по расписанию: следующий
    // `now` = dueAt предыдущего исхода.
    let card = newCard();
    let now = NOW;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i++) {
      const r = nextReview(card, "easy", now);
      intervals.push(r.scheduledDays);
      card = { ...r };
      now = r.dueAt;
    }

    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });
});

describe("nextReview — again", () => {
  it("resets progress and produces a lapse increment", () => {
    // Одно успешное повторение переводит карточку в State.Review.
    const reviewed = nextReview(newCard(), "easy", NOW);
    const card: CardFsrs = { ...reviewed };

    const again = nextReview(card, "again", NOW);
    const easyInstead = nextReview(card, "easy", NOW);

    expect(again.lapses).toBe(card.lapses + 1);
    expect(again.reps).toBe(card.reps + 1);
    // "Забыл" — стабильность падает и следующий интервал куда короче, чем
    // если бы карточку снова вспомнили.
    expect(again.stability).toBeLessThan(reviewed.stability);
    expect(again.intervalDays).toBeLessThan(easyInstead.intervalDays);
  });
});

describe("nextReview — grade mapping", () => {
  it("maps 'easy' to Rating.Good, not Rating.Easy", () => {
    const row = newCard();
    const viaModule = nextReview(row, "easy", NOW);

    const reference = fsrs({
      request_retention: DEFAULT_RETENTION,
      enable_short_term: false,
    });
    const freshCard = createEmptyCard(NOW);
    const good = reference.next(freshCard, NOW, Rating.Good).card;
    const easy = reference.next(freshCard, NOW, Rating.Easy).card;

    // Убеждаемся, что Good и Easy в принципе дают разные интервалы —
    // иначе сравнение ниже ничего бы не доказывало.
    expect(easy.scheduled_days).toBeGreaterThan(good.scheduled_days);

    expect(viaModule.scheduledDays).toBe(good.scheduled_days);
    expect(viaModule.scheduledDays).not.toBe(easy.scheduled_days);
    expect(viaModule.stability).toBe(good.stability);
  });
});

describe("nextReview — legacy SM-2 row", () => {
  it("accepts a legacy row with null stability/difficulty without throwing", () => {
    const legacyRow = newCard({
      reps: 3,
      lapses: 1,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      lastReviewedAt: new Date(NOW.getTime() - 6 * DAY_MS),
    });

    expect(() => nextReview(legacyRow, "easy", NOW)).not.toThrow();

    const r = nextReview(legacyRow, "easy", NOW);
    expect(Number.isFinite(r.stability)).toBe(true);
    expect(Number.isFinite(r.difficulty)).toBe(true);
    expect(r.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
    // Счётчик повторов легаси-карточки сохраняется и растёт как обычно.
    expect(r.reps).toBe(4);
  });

  it("toFsrsCard treats a null-stability row as brand new, not throwing", () => {
    const legacyRow = newCard({ reps: 5, lapses: 2 });
    const card = toFsrsCard(legacyRow);
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.reps).toBe(5);
    expect(card.lapses).toBe(2);
  });
});
