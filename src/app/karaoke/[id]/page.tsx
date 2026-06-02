import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteVideoButton } from '@/components/DeleteVideoButton';
import { KaraokePlayer } from '@/components/KaraokePlayer';
import { videoRepo } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function KaraokePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await videoRepo.findById(id);
  if (!video) notFound();

  return (
    <div className="container-page pb-24">
      <div className="hairline mb-6 flex items-center justify-between pt-6">
        <Link href="/" className="text-xs uppercase tracking-[0.18em] text-mute hover:text-ink">
          ← library
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-[0.18em] text-mute">
            {video.language ?? '—'} · {video.status}
          </span>
          <DeleteVideoButton
            videoId={video.id}
            ownerFingerprintHash={video.ownerFingerprintHash}
            variant="inline"
            redirectHome
          />
        </div>
      </div>

      <h1 className="mb-8 font-display text-3xl font-semibold leading-tight tracking-tightest sm:text-5xl">
        {video.title}
      </h1>

      {video.status === 'ready' && video.lyrics ? (
        <KaraokePlayer youtubeId={video.youtubeId} lines={video.lyrics} />
      ) : video.status === 'processing' ? (
        <p className="py-24 text-center text-sm uppercase tracking-[0.18em] text-mute">
          still processing — refresh in a minute
        </p>
      ) : (
        <div className="py-24 text-center">
          <p className="text-sm uppercase tracking-[0.18em] text-accent">processing failed</p>
          {video.errorMessage ? (
            <p className="mt-3 text-xs text-mute">{video.errorMessage}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
