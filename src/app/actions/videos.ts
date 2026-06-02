'use server';

import { unlink, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hashFingerprint, isValidFingerprint } from '@/lib/fingerprint';
import { redis } from '@/lib/redis';
import { videoRepo } from '@/lib/repositories';
import { buildLines } from '@/lib/transcribe/build-lines';
import { buildLinesFromCues } from '@/lib/transcribe/build-lines-from-cues';
import { transcribe } from '@/lib/transcribe/whisper';
import { fetchSubtitlesAndMeta } from '@/lib/youtube/subtitles';
import { parseYoutubeId, InvalidYoutubeUrlError } from '@/lib/youtube/url';
import { downloadAudio } from '@/lib/youtube/ytdlp';

export type AddVideoState = { error?: string };
export type DeleteVideoState = { error?: string };

export async function addVideoAction(
  _prev: AddVideoState,
  formData: FormData,
): Promise<AddVideoState> {
  const url = String(formData.get('url') ?? '');
  const rawFingerprint = formData.get('fingerprint');
  const ownerFingerprintHash = isValidFingerprint(rawFingerprint)
    ? hashFingerprint(rawFingerprint)
    : null;

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
    // Step 1: fetch metadata + try to get official YouTube subtitles in one shot.
    const meta = await fetchSubtitlesAndMeta(youtubeId);

    const video = await videoRepo.create({
      youtubeId,
      title: meta.title,
      thumbnailUrl: meta.thumbnailUrl,
      durationSec: meta.durationSec,
      status: 'processing',
      ownerFingerprintHash,
    });
    createdId = video.id;

    if (meta.subtitles) {
      // Step 2a: subs found → use them as the source of truth.
      // Romanization happens inside buildLinesFromCues for ja/ko;
      // English/Spanish words within mixed lines are passed through unchanged.
      const lines = await buildLinesFromCues(meta.subtitles.cues, meta.subtitles.language);
      await videoRepo.markReady(video.id, lines, meta.subtitles.language);
    } else {
      // Step 2b: no subs → fall back to audio download + Whisper.
      const audio = await downloadAudio(youtubeId);
      audioPath = audio.path;
      const result = await transcribe(audio.path);
      const lines = await buildLines(result);
      await videoRepo.markReady(video.id, lines, result.language);
    }
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

export async function deleteVideoAction(
  _prev: DeleteVideoState,
  formData: FormData,
): Promise<DeleteVideoState> {
  const id = String(formData.get('id') ?? '');
  const rawFingerprint = formData.get('fingerprint');

  if (!id) return { error: 'Missing video id.' };
  if (!isValidFingerprint(rawFingerprint)) {
    return { error: 'Missing or invalid fingerprint.' };
  }

  const hash = hashFingerprint(rawFingerprint);
  let removed = false;
  try {
    removed = await videoRepo.deleteIfOwner(id, hash);
  } catch (e) {
    return { error: `Could not delete: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!removed) return { error: 'You can only delete videos you added from this browser.' };

  revalidatePath('/');
  return {};
}
