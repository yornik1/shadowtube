import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { sessions } from "../schema";

export async function getSession(videoId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.videoId, videoId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSessionProgress(
  videoId: string,
  lastChunkIdx: number,
) {
  const db = getDb();
  const now = new Date();
  await db
    .insert(sessions)
    .values({ videoId, lastChunkIdx, updatedAt: now })
    .onConflictDoUpdate({
      target: sessions.videoId,
      set: { lastChunkIdx, updatedAt: now },
    });
}
