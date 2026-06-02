import type { LyricLine, NewVideo, Video } from '@/types/video';

export interface VideoRepository {
  findById(id: string): Promise<Video | null>;
  findByYoutubeId(youtubeId: string): Promise<Video | null>;
  listRecent(limit?: number): Promise<Video[]>;
  create(input: NewVideo): Promise<Video>;
  markReady(id: string, lyrics: LyricLine[], language: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** Deletes only if the fingerprint hash matches. Returns true if a row was removed. */
  deleteIfOwner(id: string, fingerprintHash: string): Promise<boolean>;
}
