import { describe, expect, it } from "vitest";

import {
  DEFAULT_EF,
  MIN_EF,
  formatDue,
  nextReview,
  type CardSrs,
} from "./sm2";

const NOW = new Date("2026-07-22T10:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function newCard(over: Partial<CardSrs> = {}): CardSrs {
  return { ef: DEFAULT_EF, intervalDays: 0, reps: 0, lapses: 0, ...over };
}

function daysUntil(due: Date): number {
  return Math.round((due.getTime() - NOW.getTime()) / DAY_MS);
}

describe("nextReview — easy", () => {
  it("first successful review schedules the card for tomorrow", () => {
    const r = nextReview(newCard(), "easy", NOW);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(1);
    expect(daysUntil(r.dueAt)).toBe(1);
  });

  it("second successful review jumps to six days", () => {
    const r = nextReview(newCard({ reps: 1, intervalDays: 1 }), "easy", NOW);
    expect(r.intervalDays).toBe(6);
    expect(r.reps).toBe(2);
  });

  it("later reviews multiply the interval by the easiness factor", () => {
    const r = nextReview(newCard({ reps: 2, intervalDays: 6, ef: 2.5 }), "easy", NOW);
    // 6 * 2.6 (ef вырос на 0.1) = 15.6 → 16
    expect(r.intervalDays).toBe(16);
  });

  it("raises the easiness factor", () => {
    const r = nextReview(newCard({ ef: 2.5 }), "easy", NOW);
    expect(r.ef).toBe(2.6);
  });

  it("never lets the easiness factor run away", () => {
    let card = newCard({ ef: 2.95, reps: 3, intervalDays: 10 });
    for (let i = 0; i < 10; i++) {
      const r = nextReview(card, "easy", NOW);
      card = { ef: r.ef, intervalDays: r.intervalDays, reps: r.reps, lapses: r.lapses };
    }
    expect(card.ef).toBeLessThanOrEqual(3.0);
  });
});

describe("nextReview — hard", () => {
  it("grows the interval slower than easy does", () => {
    const card = newCard({ reps: 2, intervalDays: 10, ef: 2.5 });
    const hard = nextReview(card, "hard", NOW);
    const easy = nextReview(card, "easy", NOW);
    expect(hard.intervalDays).toBeLessThan(easy.intervalDays);
    expect(hard.intervalDays).toBe(12);
  });

  it("still counts as remembered", () => {
    const r = nextReview(newCard({ reps: 2 }), "hard", NOW);
    expect(r.reps).toBe(3);
    expect(r.lapses).toBe(0);
  });

  it("lowers the easiness factor", () => {
    const r = nextReview(newCard({ ef: 2.5 }), "hard", NOW);
    expect(r.ef).toBe(2.35);
  });

  it("gives at least one day on the first review", () => {
    const r = nextReview(newCard(), "hard", NOW);
    expect(r.intervalDays).toBe(1);
  });
});

describe("nextReview — again", () => {
  it("resets the streak and makes the card due immediately", () => {
    const r = nextReview(newCard({ reps: 5, intervalDays: 30 }), "again", NOW);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(0);
    expect(r.dueAt.getTime()).toBe(NOW.getTime());
  });

  it("counts a lapse", () => {
    const r = nextReview(newCard({ lapses: 2 }), "again", NOW);
    expect(r.lapses).toBe(3);
  });

  it("never pushes the easiness factor below the floor", () => {
    let card = newCard({ ef: 1.5 });
    for (let i = 0; i < 10; i++) {
      const r = nextReview(card, "again", NOW);
      card = { ef: r.ef, intervalDays: r.intervalDays, reps: r.reps, lapses: r.lapses };
    }
    expect(card.ef).toBe(MIN_EF);
  });
});

describe("nextReview — general", () => {
  it("always records the review timestamp", () => {
    expect(nextReview(newCard(), "easy", NOW).lastReviewedAt).toEqual(NOW);
  });

  it("repairs a broken easiness factor coming from the database", () => {
    const r = nextReview(newCard({ ef: 0 }), "easy", NOW);
    expect(r.ef).toBe(DEFAULT_EF + 0.1);
  });

  it("keeps intervals whole so due dates land on day boundaries", () => {
    let card = newCard();
    for (let i = 0; i < 8; i++) {
      const r = nextReview(card, "easy", NOW);
      expect(Number.isInteger(r.intervalDays)).toBe(true);
      card = { ef: r.ef, intervalDays: r.intervalDays, reps: r.reps, lapses: r.lapses };
    }
  });
});

describe("formatDue", () => {
  it("describes the common cases in Russian", () => {
    expect(formatDue(null, NOW)).toBe("новая");
    expect(formatDue(NOW, NOW)).toBe("сегодня");
    expect(formatDue(new Date(NOW.getTime() - DAY_MS), NOW)).toBe("сегодня");
    expect(formatDue(new Date(NOW.getTime() + DAY_MS), NOW)).toBe("завтра");
    expect(formatDue(new Date(NOW.getTime() + 3 * DAY_MS), NOW)).toBe("через 3 дня");
    expect(formatDue(new Date(NOW.getTime() + 10 * DAY_MS), NOW)).toBe("через 10 дней");
    expect(formatDue(new Date(NOW.getTime() + 30 * DAY_MS), NOW)).toBe("через месяц");
    expect(formatDue(new Date(NOW.getTime() + 90 * DAY_MS), NOW)).toBe("через 3 мес.");
  });
});
