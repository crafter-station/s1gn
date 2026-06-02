'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { deleteVideoAction } from '@/app/actions/videos';
import { hashFingerprintBrowser, useFingerprint } from '@/lib/fingerprint-client';

type Props = {
  videoId: string;
  ownerFingerprintHash: string | null;
  /** "card" sits absolutely on the thumbnail. "inline" is a normal pill button. */
  variant?: 'card' | 'inline';
  /** If true, navigate to "/" after a successful delete. */
  redirectHome?: boolean;
};

export function DeleteVideoButton({
  videoId,
  ownerFingerprintHash,
  variant = 'inline',
  redirectHome = false,
}: Props) {
  const router = useRouter();
  const fingerprint = useFingerprint();
  const [owns, setOwns] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!fingerprint || !ownerFingerprintHash) {
      setOwns(false);
      return;
    }
    hashFingerprintBrowser(fingerprint)
      .then((mine) => {
        if (!cancelled) setOwns(mine === ownerFingerprintHash);
      })
      .catch(() => {
        if (!cancelled) setOwns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fingerprint, ownerFingerprintHash]);

  if (!owns) return null;

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!fingerprint) return;
    if (!confirm('Delete this karaoke?')) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('id', videoId);
      fd.set('fingerprint', fingerprint);
      const result = await deleteVideoAction({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (redirectHome) router.push('/');
      else router.refresh();
    });
  };

  const wrapperCls =
    variant === 'card'
      ? 'absolute right-2 top-2 z-10 flex items-center gap-2'
      : 'inline-flex items-center gap-2';

  return (
    <div className={wrapperCls} onClick={(e) => e.stopPropagation()}>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          aria-label="Delete video"
          title="Delete video"
          className="inline-flex h-8 items-center gap-1.5 bg-black/65 px-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/95 backdrop-blur-sm transition-colors hover:bg-accent disabled:opacity-60"
        >
          <TrashIcon />
          <span>{pending ? '…' : 'delete'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 border border-line bg-bg px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-mute transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
        >
          <TrashIcon />
          <span>{pending ? 'deleting…' : 'delete'}</span>
        </button>
      )}
      {error ? <span className="text-xs text-accent">{error}</span> : null}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-hidden
    >
      <path d="M2 4 H12" />
      <path d="M5 4 V2 H9 V4" />
      <path d="M3.5 4 L4 13 H10 L10.5 4" />
    </svg>
  );
}
