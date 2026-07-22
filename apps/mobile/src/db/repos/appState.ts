/**
 * Key-value поверх SQLite для счётчиков мотивации.
 *
 * Отдельная таблица, а не SecureStore: цепочка дней и дневная норма — это
 * данные учёбы, они должны жить рядом со словарём и удаляться вместе с ним.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { appState } from "../schema";
import { EMPTY_STREAK, type StreakState } from "@/src/srs/streak";

const STREAK_KEY = "srs_streak";

async function readRaw(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(appState)
    .where(eq(appState.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function writeRaw(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: appState.key, set: { value } });
}

export async function getStreakState(): Promise<StreakState> {
  const raw = await readRaw(STREAK_KEY);
  if (!raw) return EMPTY_STREAK;
  try {
    // Схема состояния может расшириться — недостающие поля берём из дефолта.
    return { ...EMPTY_STREAK, ...(JSON.parse(raw) as Partial<StreakState>) };
  } catch {
    return EMPTY_STREAK;
  }
}

export async function saveStreakState(state: StreakState): Promise<void> {
  await writeRaw(STREAK_KEY, JSON.stringify(state));
}

/**
 * Счётчик обращений к Gemini за текущие сутки.
 *
 * Free tier — 250 запросов в день, и без счётчика расход остаётся догадкой:
 * человек упирается в лимит посреди сессии и не понимает, почему перевод
 * перестал приходить.
 */
function requestKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `gemini_requests_${y}-${m}-${d}`;
}

export async function bumpRequestCount(now: Date = new Date()): Promise<number> {
  const key = requestKey(now);
  const current = Number((await readRaw(key)) ?? 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  await writeRaw(key, String(next));
  return next;
}

export async function getRequestCount(now: Date = new Date()): Promise<number> {
  const raw = await readRaw(requestKey(now));
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}
