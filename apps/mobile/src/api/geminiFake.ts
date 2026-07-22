/**
 * Фейковый переводчик для разработки и тестов.
 *
 * Без него любую проверку цепочки «выделил фразу → сохранил → повторил»
 * блокирует наличие ключа Gemini: BYOK-ключ есть не на каждом устройстве и
 * его нельзя зашить в репозиторий. Фейк даёт правдоподобные по ФОРМЕ данные,
 * не трогая сеть.
 *
 * Включается только в dev-сборке:
 *   EXPO_PUBLIC_FAKE_GEMINI=1 pnpm mobile
 *
 * Переводы намеренно помечены «[тест]» — фейк не должен молча притворяться
 * настоящим переводом и утекать в словарь как настоящий.
 */
import type {
  ChunkAnalysis,
  ChunkTranslation,
  PhraseTranslation,
} from "@shadowtube/shared";

export const FAKE_PREFIX = "[тест]";

/** Заготовки для показательных случаев: идиома, фразовый глагол, связка. */
const CANNED: Record<string, PhraseTranslation> = {
  "get away with": {
    ru: "выйти сухим из воды",
    literal: "уйти прочь с",
    definitionEn: "to do something wrong and not be punished for it",
    note: "Идиома: дословный перевод не работает, значение — «избежать наказания».",
    kind: "idiom",
  },
  "figure out": {
    ru: "разобраться",
    definitionEn: "to finally understand something after thinking about it",
    kind: "phrasal",
  },
  "in a room": {
    ru: "в одной комнате",
    definitionEn: "physically together in the same place",
    kind: "plain",
  },
};

export function isFakeGemini(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_FAKE_GEMINI === "1"
  );
}

/** Небольшая задержка — иначе не проверить состояния загрузки в UI. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fakePhraseTranslation(
  span: string,
): Promise<PhraseTranslation> {
  await delay(250);
  const canned = CANNED[span.trim().toLowerCase()];
  if (canned) return canned;

  const words = span.trim().split(/\s+/).length;
  return {
    ru: `${FAKE_PREFIX} перевод «${span.trim()}»`,
    definitionEn: `${FAKE_PREFIX} definition of "${span.trim()}" (${words} word${words === 1 ? "" : "s"})`,
    kind: words > 1 ? "collocation" : "plain",
  };
}

/** Пакетный разбор без сети — тем же путём, что и настоящий. */
export function fakeBatchAnalyses(
  chunks: { idx: number; text: string }[],
): ChunkAnalysis[] {
  return chunks.map(({ idx, text }) => {
    // Фейк обязан быть РЕПРЕЗЕНТАТИВНЫМ: настоящая модель возвращает чистую
    // фразу внутри одного предложения. Слепая нарезка words[1..4] давала
    // спаны через слом реплики («What's the process—can»), и на них легко
    // сделать ложный вывод, что автокарточки работают чисто.
    const sentence = text.split(/[.!?—–]|\.\.\./)[0] ?? text;
    const words = sentence.trim().replace(/[^\p{L}\p{N}'\s-]/gu, "").split(/\s+/).filter(Boolean);
    const span = words.length >= 3 ? words.slice(1, 4).join(" ") : words.join(" ");
    return {
      chunkIdx: idx,
      ru: `${FAKE_PREFIX} перевод чанка ${idx}: ${text.trim().slice(0, 80)}`,
      phrases: span
        ? [
            {
              span,
              ru: `${FAKE_PREFIX} перевод «${span}»`,
              definitionEn: `${FAKE_PREFIX} definition of "${span}"`,
              kind: "collocation" as const,
              worth: 4,
            },
          ]
        : [],
    };
  });
}

export async function fakeChunkTranslation(
  context: string,
): Promise<ChunkTranslation> {
  await delay(250);
  return {
    ru: `${FAKE_PREFIX} перевод чанка: ${context.trim().slice(0, 120)}`,
    notes: [],
  };
}
