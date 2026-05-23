import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "shadowtube.db";

const expoDb = openDatabaseSync(DB_NAME);

expoDb.execSync(`
PRAGMA journal_mode = WAL;
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
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_video_idx ON chunks(video_id, idx);
CREATE TABLE IF NOT EXISTS sessions (
  video_id TEXT PRIMARY KEY NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  last_chunk_idx INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
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

export const db = drizzle(expoDb, { schema });

export type Database = typeof db;
