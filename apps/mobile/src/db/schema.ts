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

export const vocabulary = sqliteTable("vocabulary", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  word: text("word").notNull(),
  phrase: text("phrase"),
  context: text("context").notNull(),
  translation: text("translation").notNull(),
  sourceVideoId: text("source_video_id").references(() => videos.id, {
    onDelete: "set null",
  }),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  ef: real("ef").notNull().default(2.5),
  intervalDays: integer("interval_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
});
