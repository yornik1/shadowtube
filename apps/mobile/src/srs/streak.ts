/**
 * Цепочка дней и дневная норма.
 *
 * День засчитывается, когда выполнена норма (по умолчанию 10 карточек) —
 * иначе число теряет смысл: одна карточка в день не выучит ничего, но
 * поддерживала бы «цепочку в 40 дней».
 *
 * Даты сравниваем по локальному дню: цепочка должна ломаться в полночь
 * пользователя, а не в UTC.
 */

export const DEFAULT_DAILY_GOAL = 10;

export type StreakState = {
  /** Локальный день, к которому относится `todayCount`. */
  todayKey: string | null;
  todayCount: number;
  /** Последний день, когда норма была выполнена. */
  lastGoalDayKey: string | null;
  current: number;
  best: number;
};

export const EMPTY_STREAK: StreakState = {
  todayKey: null,
  todayCount: 0,
  lastGoalDayKey: null,
  current: 0,
  best: 0,
};

/** Локальная дата в виде YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previousDayKey(d: Date): string {
  const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return dayKey(prev);
}

/** Одна повторённая карточка. Возвращает новое состояние. */
export function registerReview(
  state: StreakState,
  now: Date = new Date(),
  goal: number = DEFAULT_DAILY_GOAL,
): StreakState {
  const today = dayKey(now);
  const sameDay = state.todayKey === today;
  const todayCount = (sameDay ? state.todayCount : 0) + 1;

  const next: StreakState = {
    ...state,
    todayKey: today,
    todayCount,
  };

  // Норма выполняется ровно один раз за день — дальше счётчик просто растёт.
  const justMetGoal = todayCount >= goal && state.lastGoalDayKey !== today;
  if (justMetGoal) {
    const continued = state.lastGoalDayKey === previousDayKey(now);
    next.current = continued ? state.current + 1 : 1;
    next.best = Math.max(state.best, next.current);
    next.lastGoalDayKey = today;
  }

  return next;
}

export type StreakStatus = {
  /** Цепочка с учётом пропусков: вчера не занимался — уже ноль. */
  current: number;
  best: number;
  doneToday: number;
  goal: number;
  remaining: number;
  goalMet: boolean;
  /** Норма выполнена вчера, но не сегодня — цепочка сгорит в полночь. */
  atRisk: boolean;
};

export function streakStatus(
  state: StreakState,
  now: Date = new Date(),
  goal: number = DEFAULT_DAILY_GOAL,
): StreakStatus {
  const today = dayKey(now);
  const yesterday = previousDayKey(now);

  const doneToday = state.todayKey === today ? state.todayCount : 0;
  const goalMet = state.lastGoalDayKey === today;
  const alive = goalMet || state.lastGoalDayKey === yesterday;

  return {
    current: alive ? state.current : 0,
    best: state.best,
    doneToday,
    goal,
    remaining: Math.max(0, goal - doneToday),
    goalMet,
    atRisk: !goalMet && state.lastGoalDayKey === yesterday && state.current > 0,
  };
}
