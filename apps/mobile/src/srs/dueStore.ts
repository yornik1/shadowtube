/**
 * Счётчик карточек к повторению — для бейджа на вкладке.
 *
 * Держим в сторе, а не считаем в layout: бейдж должен обновляться сразу после
 * сохранения фразы в сессии, без перехода на вкладку.
 */
import { create } from "zustand";
import { countDue } from "@/src/db/repos/vocabulary";

type DueState = {
  count: number;
  refresh: () => Promise<void>;
};

export const useDueStore = create<DueState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      set({ count: await countDue() });
    } catch {
      // БД может быть ещё не готова на первом рендере — бейдж не критичен.
    }
  },
}));

/** Вызывать после любого изменения словаря. */
export function refreshDueCount(): void {
  void useDueStore.getState().refresh();
}
