import { createHash } from 'node:crypto';

const FINGERPRINT_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidFingerprint(raw: unknown): raw is string {
  return typeof raw === 'string' && FINGERPRINT_RE.test(raw);
}

export function hashFingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
