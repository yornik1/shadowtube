/**
 * Выделение фразы в транскрипте по схеме тап-тап.
 *
 * Почему не drag: перетаскивание по вложенным <Text> в React Native работает
 * ненадёжно (жест перехватывает ScrollView), а тап по <Text> — единственный
 * жест, который стабильно доходит. Поэтому: первый тап ставит якорь, второй
 * растягивает выделение до второго слова.
 *
 * Логика чистая и без React — покрыта юнит-тестами.
 */

export type Token = {
  type: "word" | "space";
  value: string;
  /** Позиция в общем массиве токенов (включая пробелы). */
  index: number;
};

/** Индексы токенов-слов; anchor может быть больше focus (выделение справа налево). */
export type Selection = { anchor: number; focus: number };

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    tokens.push({
      type: /^\s+$/.test(part) ? "space" : "word",
      value: part,
      index: tokens.length,
    });
  }
  return tokens;
}

/**
 * Переход состояния по тапу на слово:
 * - нет выделения           → выделяем одно слово;
 * - выделено это же слово   → снимаем выделение;
 * - выделено одно слово     → растягиваем до текущего;
 * - выделен диапазон        → начинаем заново с одного слова.
 */
export function toggleSelection(
  current: Selection | null,
  tokenIndex: number,
): Selection | null {
  if (!current) return { anchor: tokenIndex, focus: tokenIndex };

  const isSingle = current.anchor === current.focus;
  if (isSingle) {
    if (current.anchor === tokenIndex) return null;
    return { anchor: current.anchor, focus: tokenIndex };
  }

  return { anchor: tokenIndex, focus: tokenIndex };
}

/** Границы выделения по возрастанию — выделять можно в любую сторону. */
export function selectionBounds(sel: Selection): { from: number; to: number } {
  return sel.anchor <= sel.focus
    ? { from: sel.anchor, to: sel.focus }
    : { from: sel.focus, to: sel.anchor };
}

export function isSelected(sel: Selection | null, tokenIndex: number): boolean {
  if (!sel) return false;
  const { from, to } = selectionBounds(sel);
  return tokenIndex >= from && tokenIndex <= to;
}

/** Пунктуация по краям выделения — мусор для переводчика. */
function trimEdgePunctuation(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}%]+$/u, "");
}

/** Текст выделения — вместе с пробелами между словами. */
export function selectedText(tokens: Token[], sel: Selection | null): string {
  if (!sel) return "";
  const { from, to } = selectionBounds(sel);
  const raw = tokens
    .filter((t) => t.index >= from && t.index <= to)
    .map((t) => t.value)
    .join("");
  return trimEdgePunctuation(raw.trim());
}

/**
 * Ближайшее слово к тапнутому токену.
 *
 * Промежутки между словами — это тоже площадь экрана, и попасть в них легко:
 * без этого пользователь тапает, ничего не происходит, и он решает, что
 * приложение сломано. Пробел отдаём слову слева (перед ним), а если слева
 * ничего нет — первому слову справа.
 */
export function nearestWordIndex(
  tokens: Token[],
  tokenIndex: number,
): number | null {
  const token = tokens[tokenIndex];
  if (!token) return null;
  if (token.type === "word") return tokenIndex;

  for (let i = tokenIndex - 1; i >= 0; i--) {
    if (tokens[i]!.type === "word") return i;
  }
  for (let i = tokenIndex + 1; i < tokens.length; i++) {
    if (tokens[i]!.type === "word") return i;
  }
  return null;
}

/** Сколько слов выделено — для подписи «фраза из N слов». */
export function selectedWordCount(
  tokens: Token[],
  sel: Selection | null,
): number {
  if (!sel) return 0;
  const { from, to } = selectionBounds(sel);
  return tokens.filter(
    (t) => t.type === "word" && t.index >= from && t.index <= to,
  ).length;
}
