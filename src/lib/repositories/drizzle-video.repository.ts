import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { VideoRow } from '@/lib/db/schema';
import type { LyricLine, NewVideo, Video } from '@/types/video';
import type { VideoRepository } from './video.repository';

function toDomain(row: VideoRow): Video {
  return {
    id: row.id,
    youtubeId: row.youtubeId,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl,
    durationSec: row.durationSec,
    language: row.language,
    status: row.status,
    errorMessage: row.errorMessage,
    lyrics: row.lyrics ?? null,
    ownerFingerprintHash: row.ownerFingerprintHash ?? null,
    createdAt: row.createdAt,
  };
}

export class DrizzleVideoRepository implements VideoRepository {
  async findById(id: string): Promise<Video | null> {
    const [row] = await db.select().from(schema.videos).where(eq(schema.videos.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByYoutubeId(youtubeId: string): Promise<Video | null> {
    const [row] = await db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.youtubeId, youtubeId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listRecent(limit = 24): Promise<Video[]> {
    const rows = await db
      .select()
      .from(schema.videos)
      .orderBy(desc(schema.videos.createdAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async create(input: NewVideo): Promise<Video> {
    const [row] = await db
      .insert(schema.videos)
      .values({
        youtubeId: input.youtubeId,
        title: input.title,
        thumbnailUrl: input.thumbnailUrl,
        durationSec: input.durationSec,
        status: input.status,
        ownerFingerprintHash: input.ownerFingerprintHash ?? null,
      })
      .returning();
    return toDomain(row);
  }

  async markReady(id: string, lyrics: LyricLine[], language: string): Promise<void> {
    await db
      .update(schema.videos)
      .set({ status: 'ready', lyrics, language, errorMessage: null })
      .where(eq(schema.videos.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await db
      .update(schema.videos)
      .set({ status: 'failed', errorMessage: error.slice(0, 1000) })
      .where(eq(schema.videos.id, id));
  }

  async deleteIfOwner(id: string, fingerprintHash: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.videos)
      .where(
        and(
          eq(schema.videos.id, id),
          eq(schema.videos.ownerFingerprintHash, fingerprintHash),
        ),
      )
      .returning({ id: schema.videos.id });
    return deleted.length > 0;
  }
}
