import type { LyricLine, LyricWord } from '@/types/video';
import type { SubCue } from '@/lib/youtube/subtitles';
import { needsRomanization, romanize } from './romanize';

const VOWEL_RE = /[aeiouAEIOUáéíóúÁÉÍÓÚâêîôûÂÊÎÔÛ]/g;

function syllableWeight(token: string): number {
  const m = token.match(VOWEL_RE);
  return Math.max(1, m?.length ?? 1);
}

const NOISE_ONLY_RE = /^[\[(♪].*[\])♪]$|^\.\.\.$/;

export async function buildLinesFromCues(
  cues: SubCue[],
  language: string,
): Promise<LyricLine[]> {
  const shouldRomanize = needsRomanization(language);
  const lines: LyricLine[] = [];

  for (const cue of cues) {
    const cleaned = cue.text.trim();
    if (!cleaned || NOISE_ONLY_RE.test(cleaned)) continue;

    const display = shouldRomanize
      ? (await romanize(cleaned, language)).trim() || cleaned
      : cleaned;

    const tokens = display.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const totalMs = Math.max(1, cue.endMs - cue.startMs);
    const weights = tokens.map(syllableWeight);
    const weightSum = weights.reduce((a, b) => a + b, 0);

    const words: LyricWord[] = [];
    let cursor = cue.startMs;
    for (let i = 0; i < tokens.length; i++) {
      const share = (weights[i] / weightSum) * totalMs;
      const endMs = i === tokens.length - 1 ? cue.endMs : Math.round(cursor + share);
      words.push({ text: tokens[i], startMs: cursor, endMs });
      cursor = endMs;
    }

    lines.push({ startMs: cue.startMs, endMs: cue.endMs, words });
  }

  return lines;
}
