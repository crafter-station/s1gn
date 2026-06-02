'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 's1ng-fingerprint';

function readOrCreate(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && existing.length >= 8) return existing;
  const fresh = window.crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

export function useFingerprint(): string | null {
  const [fp, setFp] = useState<string | null>(null);
  useEffect(() => {
    try {
      setFp(readOrCreate());
    } catch {
      setFp(null);
    }
  }, []);
  return fp;
}

export async function hashFingerprintBrowser(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
