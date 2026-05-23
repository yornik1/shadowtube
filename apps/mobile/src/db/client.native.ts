import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "shadowtube.db";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _initError: Error | null = null;

function runMigrations(expoDb: ReturnType<typeof openDatabaseSync>) {
  expoDb.execSync(`PRAGMA journal_mode = WAL;`);
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT '',
      duration_sec REAL NOT NULL DEFAULT 0,
      thumbnail TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      last_opened_at INTEGER
    );
  `);
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      text TEXT NOT NULL
    );
  `);
  expoDb.execSync(`
    CREATE UNIQUE INDEX IF NOT EXISTS chunks_video_idx ON chunks(video_id, idx);
  `);
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS sessions (
      video_id TEXT PRIMARY KEY NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      last_chunk_idx INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      word TEXT NOT NULL,
      phrase TEXT,
      context TEXT NOT NULL,
      translation TEXT NOT NULL,
      source_video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
      added_at INTEGER NOT NULL,
      ef REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER
    );
  `);
}

export function getDb() {
  if (_initError) throw _initError;
  if (_db) return _db;
  try {
    const expoDb = openDatabaseSync(DB_NAME);
    runMigrations(expoDb);
    _db = drizzle(expoDb, { schema });
    return _db;
  } catch (e) {
    _initError = e instanceof Error ? e : new Error(String(e));
    console.error("[ShadowTube] SQLite init failed:", _initError);
    throw _initError;
  }
}

/** @deprecated use getDb() */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Database = ReturnType<typeof getDb>;
