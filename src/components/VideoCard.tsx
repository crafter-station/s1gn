import Image from 'next/image';
import Link from 'next/link';
import { DeleteVideoButton } from './DeleteVideoButton';
import type { Video } from '@/types/video';

function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusLabel(status: Video['status']): string {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'processing':
      return 'processing…';
    case 'failed':
      return 'failed';
  }
}

export function VideoCard({ video }: { video: Video }) {
  const disabled = video.status !== 'ready';
  const inner = (
    <article className="group flex h-full flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden border border-line bg-line">
        <Image
          src={video.thumbnailUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
          className={`object-cover transition-transform duration-500 ${
            disabled ? 'opacity-60' : 'group-hover:scale-[1.02]'
          }`}
        />
        <span className="absolute bottom-2 right-2 bg-bg/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-ink">
          {fmtDuration(video.durationSec)}
        </span>
        <DeleteVideoButton
          videoId={video.id}
          ownerFingerprintHash={video.ownerFingerprintHash}
          variant="card"
        />
      </div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-base font-medium leading-snug text-ink">{video.title}</h3>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-mute">
          {video.language ?? '—'}
        </span>
      </div>
      <span
        className={`text-[10px] uppercase tracking-[0.18em] ${
          video.status === 'failed' ? 'text-accent' : 'text-mute'
        }`}
      >
        {statusLabel(video.status)}
      </span>
    </article>
  );

  if (disabled) return <div className="cursor-default">{inner}</div>;
  return (
    <Link href={`/karaoke/${video.id}`} className="block">
      {inner}
    </Link>
  );
}
