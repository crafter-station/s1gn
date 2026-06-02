'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addVideoAction, type AddVideoState } from '@/app/actions/videos';
import { useFingerprint } from '@/lib/fingerprint-client';

const initial: AddVideoState = {};

export function AddVideoForm() {
  const [state, formAction] = useActionState(addVideoAction, initial);
  const fingerprint = useFingerprint();

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="fingerprint" value={fingerprint ?? ''} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="url"
          type="url"
          required
          placeholder="https://youtube.com/watch?v=…"
          className="h-14 flex-1 rounded-none border border-ink bg-bg px-4 text-base text-ink outline-none placeholder:text-mute focus:border-accent"
          autoComplete="off"
          inputMode="url"
        />
        <SubmitButton disabled={!fingerprint} />
      </div>
      {state.error ? (
        <p className="mt-3 text-sm text-accent">{state.error}</p>
      ) : (
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-mute">
          processing takes a minute or two · download · transcribe · romanize
        </p>
      )}
    </form>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-14 whitespace-nowrap rounded-none border border-ink bg-ink px-6 text-sm font-medium uppercase tracking-[0.18em] text-bg transition-colors hover:bg-accent hover:border-accent disabled:cursor-progress disabled:opacity-60"
    >
      {pending ? 'processing…' : 'make karaoke'}
    </button>
  );
}
