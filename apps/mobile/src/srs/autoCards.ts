/**
 * Автосоздание карточек из разбора чанка.
 *
 * Главный риск тут — не качество, а объём: в трёхчасовом видео 1234 чанка, по
 * две фразы на каждый это 2400 карточек при дневной норме в 10. Поэтому отбор
 * идёт через несколько предохранителей, а не «всё, что вернула модель».
 *
 * Логика чистая, без БД и React — покрыта тестами.
 */
import type { PhraseCandidate } from "@shadowtube/shared";

/** Ниже этой оценки фраза не окупает место в очереди повторений. */
export const MIN_WORTH = 4;
/** Больше двух карточек с одного предложения — это уже зубрёжка контекста. */
export const MAX_PER_CHUNK = 2;
/** Потолок за сессию: очередь не должна распухать быстрее, чем разгребается. */
export const MAX_PER_SESSION = 15;

export type AutoCardDecision = {
  accepted: PhraseCandidate[];
  /** Причины отказа — для дев-логов, чтобы отбор можно было отладить. */
  rejected: { span: string; reason: string }[];
};

function isUsableSpan(span: string): boolean {
  const s = span.trim();
  if (s.length < 2 || s.length > 80) return false;
  // Остатки автосабов: «figure out- - That's», «[Music]», «(laughs)».
  // Дефис внутри слова (well-known) законен, дефис рядом с пробелом — нет.
  if (/--|\s-|-\s|\[|\]|\(|\)/.test(s)) return false;
  // Фраза обязана содержать буквы, а не только цифры и знаки.
  if (!/\p{L}/u.test(s)) return false;
  return true;
}

/**
 * Отбирает фразы одного чанка, пригодные для автосохранения.
 *
 * `alreadyKnown` — нормализованные тексты уже существующих карточек: модель
 * стабильно предлагает одни и те же ходовые связки в разных чанках.
 */
export function selectAutoCards(
  phrases: PhraseCandidate[],
  options: {
    alreadyKnown: Set<string>;
    sessionCount: number;
    minWorth?: number;
  },
): AutoCardDecision {
  const { alreadyKnown, sessionCount } = options;
  const minWorth = options.minWorth ?? MIN_WORTH;

  const accepted: PhraseCandidate[] = [];
  const rejected: { span: string; reason: string }[] = [];

  if (sessionCount >= MAX_PER_SESSION) {
    return {
      accepted: [],
      rejected: phrases.map((p) => ({ span: p.span, reason: "session-cap" })),
    };
  }

  // Сначала самые полезные: если упрёмся в лимит, отсечём слабое, а не сильное.
  const ranked = [...phrases].sort((a, b) => b.worth - a.worth);

  for (const p of ranked) {
    if (accepted.length >= MAX_PER_CHUNK) {
      rejected.push({ span: p.span, reason: "chunk-cap" });
      continue;
    }
    if (sessionCount + accepted.length >= MAX_PER_SESSION) {
      rejected.push({ span: p.span, reason: "session-cap" });
      continue;
    }
    if (p.worth < minWorth) {
      rejected.push({ span: p.span, reason: "low-worth" });
      continue;
    }
    // Прозрачные конструкции переводятся по словам и карточки не заслуживают.
    if (p.kind === "plain") {
      rejected.push({ span: p.span, reason: "plain" });
      continue;
    }
    if (!isUsableSpan(p.span)) {
      rejected.push({ span: p.span, reason: "malformed" });
      continue;
    }
    if (alreadyKnown.has(p.span.trim().toLowerCase())) {
      rejected.push({ span: p.span, reason: "duplicate" });
      continue;
    }
    accepted.push(p);
  }

  return { accepted, rejected };
}
