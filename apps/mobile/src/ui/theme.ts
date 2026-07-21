/**
 * Дизайн-токены.
 *
 * До этого цвета были захардкожены в каждом StyleSheet (#0f0f14, #1a1a24, …),
 * из-за чего оттенки разъезжались между экранами. Палитра та же, что была,
 * но приведена к одной шкале: фон → поверхность → приподнятая поверхность.
 *
 * Правило: в компонентах не должно остаться сырых hex-значений.
 */

export const colors = {
  /** Фон экрана. */
  bg: "#0f0f14",
  /** Карточки, поля ввода, таб-бар. */
  surface: "#1a1a24",
  /** Поверхность поверх поверхности: активный чанк, модалка. */
  surfaceRaised: "#22222f",
  border: "#2a2a3a",
  borderStrong: "#3a3a4d",

  /** Основное действие: Replay, «Показать ответ». */
  primary: "#4361ee",
  primaryPressed: "#3651c9",
  /** Акцент для ссылок, выделенного текста, чисел. */
  accent: "#7eb8ff",
  accentSoft: "#7eb8ff26",

  text: "#ffffff",
  textMuted: "#9a9aae",
  textFaint: "#6b6b80",

  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#ff6b6b",
  /** Цепочка дней — тёплый, отличный от success. */
  streak: "#ff9f45",

  overlay: "#000000cc",
  backdrop: "rgba(0,0,0,0.55)",
} as const;

/** Шаг 4px. Использовать вместо произвольных отступов. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  /** Мелкие подписи, хинты. */
  caption: { fontSize: 12, lineHeight: 16 },
  /** Вторичный текст: контекст, метаданные. */
  small: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  /** Заголовок секции, слово в словаре. */
  title: { fontSize: 20, lineHeight: 28 },
  /** Фраза на карточке повторения, активный чанк. */
  display: { fontSize: 26, lineHeight: 36 },
} as const;

/** Минимальная площадь тапа по гайдлайнам Android. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
