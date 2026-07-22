/**
 * Арифметика окна предзагрузки — отдельно от geminiBatch.ts намеренно.
 *
 * geminiBatch тянет за собой expo-sqlite (кэш переводов), а это нативный
 * модуль: тест, импортирующий его, падает ещё на разборе зависимостей.
 * Здесь чистая математика, которую можно гонять в vitest без устройства.
 */

/** Сколько чанков вперёд держим переведёнными. Совпадает с размером пакета. */
export const LOOKAHEAD = 20;

/** Индексы окна: текущий чанк и LOOKAHEAD вперёд, в пределах видео. */
export function windowIndexes(
  currentIdx: number,
  total: number,
  lookahead: number = LOOKAHEAD,
): number[] {
  // Клампим саму позицию, а не только левую границу: иначе при отрицательном
  // индексе правая граница уезжает в минус и окно схлопывается в пустое —
  // перевод молча не загрузится вместо того, чтобы начаться с начала видео.
  const start = Math.max(0, currentIdx);
  const from = start;
  const to = Math.min(total - 1, start + lookahead);
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
