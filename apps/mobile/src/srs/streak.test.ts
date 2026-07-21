import { describe, expect, it } from "vitest";

import {
  DEFAULT_DAILY_GOAL,
  EMPTY_STREAK,
  dayKey,
  registerReview,
  streakStatus,
  type StreakState,
} from "./streak";

/** Локальный полдень — чтобы тест не зависел от часового пояса машины. */
function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour);
}

/** Прогоняет `count` повторений подряд в один день. */
function review(state: StreakState, when: Date, count: number): StreakState {
  let s = state;
  for (let i = 0; i < count; i++) s = registerReview(s, when, DEFAULT_DAILY_GOAL);
  return s;
}

describe("dayKey", () => {
  it("uses the local calendar day", () => {
    expect(dayKey(at(2026, 7, 22))).toBe("2026-07-22");
  });

  it("changes at local midnight, not at UTC midnight", () => {
    expect(dayKey(at(2026, 7, 22, 23))).toBe("2026-07-22");
    expect(dayKey(at(2026, 7, 23, 0))).toBe("2026-07-23");
  });
});

describe("registerReview", () => {
  it("counts cards within a day", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), 3);
    expect(s.todayCount).toBe(3);
    expect(s.current).toBe(0);
  });

  it("starts the streak when the daily goal is reached", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    expect(s.current).toBe(1);
    expect(s.lastGoalDayKey).toBe("2026-07-22");
  });

  it("does not count the goal twice on the same day", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL + 7);
    expect(s.current).toBe(1);
    expect(s.todayCount).toBe(DEFAULT_DAILY_GOAL + 7);
  });

  it("extends the streak on consecutive days", () => {
    let s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 23), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 24), DEFAULT_DAILY_GOAL);
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
  });

  it("restarts the streak after a skipped day", () => {
    let s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 23), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 25), DEFAULT_DAILY_GOAL);
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it("resets the daily counter on a new day", () => {
    let s = review(EMPTY_STREAK, at(2026, 7, 22), 4);
    s = registerReview(s, at(2026, 7, 23));
    expect(s.todayCount).toBe(1);
  });

  it("keeps the best streak after a break", () => {
    let s = review(EMPTY_STREAK, at(2026, 7, 1), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 2), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 7, 20), DEFAULT_DAILY_GOAL);
    expect(s.best).toBe(2);
    expect(s.current).toBe(1);
  });

  it("survives a month boundary", () => {
    let s = review(EMPTY_STREAK, at(2026, 7, 31), DEFAULT_DAILY_GOAL);
    s = review(s, at(2026, 8, 1), DEFAULT_DAILY_GOAL);
    expect(s.current).toBe(2);
  });
});

describe("streakStatus", () => {
  it("reports progress toward the daily goal", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), 4);
    const st = streakStatus(s, at(2026, 7, 22));
    expect(st.doneToday).toBe(4);
    expect(st.remaining).toBe(DEFAULT_DAILY_GOAL - 4);
    expect(st.goalMet).toBe(false);
  });

  it("marks the goal as met", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    const st = streakStatus(s, at(2026, 7, 22));
    expect(st.goalMet).toBe(true);
    expect(st.remaining).toBe(0);
    expect(st.current).toBe(1);
  });

  it("flags the streak as at risk the day after", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    const st = streakStatus(s, at(2026, 7, 23));
    expect(st.atRisk).toBe(true);
    expect(st.current).toBe(1);
    expect(st.doneToday).toBe(0);
  });

  it("shows a broken streak as zero without touching the record", () => {
    const s = review(EMPTY_STREAK, at(2026, 7, 22), DEFAULT_DAILY_GOAL);
    const st = streakStatus(s, at(2026, 7, 25));
    expect(st.current).toBe(0);
    expect(st.atRisk).toBe(false);
    expect(st.best).toBe(1);
  });

  it("handles an untouched state", () => {
    const st = streakStatus(EMPTY_STREAK, at(2026, 7, 22));
    expect(st).toMatchObject({ current: 0, doneToday: 0, goalMet: false, atRisk: false });
  });
});
