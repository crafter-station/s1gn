import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import type { LyricLine } from '@/types/video';

export const videos = pgTable('videos', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeId: text('youtube_id').notNull().unique(),
  title: text('title').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  durationSec: integer('duration_sec').notNull(),
  language: text('language'),
  status: text('status').notNull().$type<'processing' | 'ready' | 'failed'>(),
  errorMessage: text('error_message'),
  lyrics: jsonb('lyrics').$type<LyricLine[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type VideoRow = typeof videos.$inferSelect;
export type VideoInsert = typeof videos.$inferInsert;
