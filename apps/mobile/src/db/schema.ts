import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  channel: text("channel").notNull().default(""),
  durationSec: real("duration_sec").notNull().default(0),
  thumbnail: text("thumbnail").notNull().default(""),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp_ms" }),
});

export const chunks = sqliteTable(
  "chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    text: text("text").notNull(),
  },
  (t) => [uniqueIndex("chunks_video_idx").on(t.videoId, t.idx)],
);

export const sessions = sqliteTable("sessions", {
  videoId: text("video_id")
    .primaryKey()
    .references(() => videos.id, { onDelete: "cascade" }),
  lastChunkIdx: integer("last_chunk_idx").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Что за карточка: выделенная фраза или сохранённый целиком чанк. */
export type VocabularyKind = "phrase" | "chunk";

export const vocabulary = sqliteTable("vocabulary", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Английская сторона карточки: выделенная фраза или текст чанка. */
  word: text("word").notNull(),
  /** @deprecated легаси MVP — дублировало `word`, больше не пишется. */
  phrase: text("phrase"),
  /** Предложение, из которого взята фраза. */
  context: text("context").notNull(),
  /** Естественный русский перевод. */
  translation: text("translation").notNull(),
  sourceVideoId: text("source_video_id").references(() => videos.id, {
    onDelete: "set null",
  }),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),

  kind: text("kind").$type<VocabularyKind>().notNull().default("phrase"),
  /** Английское определение — режим карточек «толковый словарь». */
  definitionEn: text("definition_en"),
  /** Дословный перевод, если расходится с естественным. */
  literal: text("literal"),
  /** Пояснение про идиому. */
  note: text("note"),

  /** Тайминги исходного чанка — чтобы прыгнуть в видео из карточки. */
  startSec: real("start_sec"),
  endSec: real("end_sec"),
  chunkIdx: integer("chunk_idx"),

  // --- SM-2 ---
  ef: real("ef").notNull().default(2.5),
  intervalDays: integer("interval_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  lapses: integer("lapses").notNull().default(0),
});

/** Key-value для счётчиков мотивации: цепочка дней, дневная норма, напоминание. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
