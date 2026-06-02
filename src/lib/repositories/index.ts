import { DrizzleVideoRepository } from './drizzle-video.repository';
import type { VideoRepository } from './video.repository';

const globalForRepo = globalThis as unknown as { __s1ngVideoRepo?: VideoRepository };

export const videoRepo: VideoRepository =
  globalForRepo.__s1ngVideoRepo ?? new DrizzleVideoRepository();

if (process.env.NODE_ENV !== 'production') globalForRepo.__s1ngVideoRepo = videoRepo;

export type { VideoRepository };
