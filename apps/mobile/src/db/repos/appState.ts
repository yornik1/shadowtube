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
