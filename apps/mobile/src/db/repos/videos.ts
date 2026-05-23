import { eq, desc } from "drizzle-orm";
import { getDb } from "../client.native";
import { videos, chunks, sessions } from "../schema";
import type { Chunk, VideoMetadata } from "@shadowtube/shared";

export async function upsertVideo(
  id: string,
  url: string,
  meta: VideoMetadata,
  chunkList: Chunk[],
): Promise<void> {
  const now = new Date();
  const db = getDb();
  await db
    .insert(videos)
    .values({
      id,
      url,
      title: meta.title,
      channel: meta.channel,
      durationSec: meta.durationSec,
      thumbnail: meta.thumbnail,
      addedAt: now,
      lastOpenedAt: now,
    })
    .onConflictDoUpdate({
      target: videos.id,
      set: {
        title: meta.title,
        channel: meta.channel,
        durationSec: meta.durationSec,
        thumbnail: meta.thumbnail,
        lastOpenedAt: now,
      },
    });

  await db.delete(chunks).where(eq(chunks.videoId, id));

  if (chunkList.length > 0) {
    await db.insert(chunks).values(
      chunkList.map((c, idx) => ({
        videoId: id,
        idx,
        startSec: c.start,
        endSec: c.end,
        text: c.text,
      })),
    );
  }

  await db
    .insert(sessions)
    .values({ videoId: id, lastChunkIdx: 0, updatedAt: now })
    .onConflictDoNothing();
}

export async function touchVideo(id: string) {
  const db = getDb();
  await db
    .update(videos)
    .set({ lastOpenedAt: new Date() })
    .where(eq(videos.id, id));
}

export async function listRecentVideos(limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(videos)
    .orderBy(desc(videos.lastOpenedAt), desc(videos.addedAt))
    .limit(limit);
}

export async function getVideo(id: string) {
  const db = getDb();
  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getChunksForVideo(videoId: string) {
  const db = getDb();
  return db
    .select()
    .from(chunks)
    .where(eq(chunks.videoId, videoId))
    .orderBy(chunks.idx);
}
