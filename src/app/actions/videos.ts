'use server';

import { unlink, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { redis } from '@/lib/redis';
import { videoRepo } from '@/lib/repositories';
import { buildLines } from '@/lib/transcribe/build-lines';
import { transcribe } from '@/lib/transcribe/whisper';
import { parseYoutubeId, InvalidYoutubeUrlError } from '@/lib/youtube/url';
import { downloadAudio } from '@/lib/youtube/ytdlp';

export type AddVideoState = { error?: string };

export async function addVideoAction(
  _prev: AddVideoState,
  formData: FormData,
): Promise<AddVideoState> {
  const url = String(formData.get('url') ?? '');
  let youtubeId: string;
  try {
    youtubeId = parseYoutubeId(url);
  } catch (e) {
    if (e instanceof InvalidYoutubeUrlError) return { error: e.message };
    throw e;
  }

  const existing = await videoRepo.findByYoutubeId(youtubeId);
  if (existing) {
    revalidatePath('/');
    redirect(`/karaoke/${existing.id}`);
  }

  const lockKey = `lock:video:${youtubeId}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
  if (!acquired) {
    const after = await videoRepo.findByYoutubeId(youtubeId);
    if (after) redirect(`/karaoke/${after.id}`);
    return { error: 'This video is already being processed. Please try again in a moment.' };
  }

  let audioPath: string | null = null;
  let createdId: string | null = null;
  try {
    const audio = await downloadAudio(youtubeId);
    audioPath = audio.path;

    const video = await videoRepo.create({
      youtubeId,
      title: audio.title,
      thumbnailUrl: audio.thumbnailUrl,
      durationSec: audio.durationSec,
      status: 'processing',
    });
    createdId = video.id;

    const result = await transcribe(audio.path);
    const lines = await buildLines(result);

    await videoRepo.markReady(video.id, lines, result.language);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (createdId) await videoRepo.markFailed(createdId, message);
    await redis.del(lockKey);
    await cleanup(audioPath);
    return { error: `Could not process this video: ${message}` };
  }

  await redis.del(lockKey);
  await cleanup(audioPath);
  revalidatePath('/');
  redirect(`/karaoke/${createdId}`);
}

async function cleanup(audioPath: string | null): Promise<void> {
  if (!audioPath) return;
  try {
    await unlink(audioPath);
    await rm(dirname(audioPath), { recursive: true, force: true });
  } catch {
    // best effort
  }
}
