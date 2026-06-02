import type { LyricLine, LyricWord } from '@/types/video';
import { needsRomanization, romanize } from './romanize';
import type { WhisperResult, WhisperSegment, WhisperWord } from './whisper';

function bucketWordsBySegment(segments: WhisperSegment[], words: WhisperWord[]): WhisperWord[][] {
  const buckets: WhisperWord[][] = segments.map(() => []);
  if (segments.length === 0) return buckets;

  let cursor = 0;
  for (const w of words) {
    const t = (w.start + w.end) / 2;
    while (cursor < segments.length - 1 && t >= segments[cursor].end) cursor++;
    buckets[cursor].push(w);
  }
  return buckets;
}

function isJapanese(language: string): boolean {
  return language === 'ja' || language === 'japanese';
}

const VOWEL_RE = /[aeiouAEIOU]/g;
function syllableWeight(token: string): number {
  const m = token.match(VOWEL_RE);
  return Math.max(1, m?.length ?? 1);
}

async function buildJapaneseLine(seg: WhisperSegment): Promise<LyricLine | null> {
  const romaji = (await romanize(seg.text, 'ja')).trim();
  if (!romaji) return null;

  const tokens = romaji
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const segStartMs = Math.round(seg.start * 1000);
  const segEndMs = Math.round(seg.end * 1000);
  const totalMs = Math.max(1, segEndMs - segStartMs);

  const weights = tokens.map(syllableWeight);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const words: LyricWord[] = [];
  let cursor = segStartMs;
  for (let i = 0; i < tokens.length; i++) {
    const share = (weights[i] / weightSum) * totalMs;
    const endMs = i === tokens.length - 1 ? segEndMs : Math.round(cursor + share);
    words.push({ text: tokens[i], startMs: cursor, endMs });
    cursor = endMs;
  }

  return { startMs: segStartMs, endMs: segEndMs, words };
}

async function buildPerWordLine(
  seg: WhisperSegment,
  rawWords: WhisperWord[],
  language: string,
  shouldRomanize: boolean,
): Promise<LyricLine | null> {
  const words: LyricWord[] =
    rawWords.length > 0
      ? await Promise.all(
          rawWords.map(async (w) => {
            const text = shouldRomanize ? await romanize(w.word, language) : w.word;
            return {
              text: (text || '').trim() || w.word,
              startMs: Math.round(w.start * 1000),
              endMs: Math.round(w.end * 1000),
            };
          }),
        )
      : [
          {
            text: shouldRomanize ? (await romanize(seg.text, language)).trim() || seg.text : seg.text,
            startMs: Math.round(seg.start * 1000),
            endMs: Math.round(seg.end * 1000),
          },
        ];

  if (words.length === 0) return null;
  return {
    startMs: Math.round(seg.start * 1000),
    endMs: Math.round(seg.end * 1000),
    words,
  };
}

export async function buildLines(result: WhisperResult): Promise<LyricLine[]> {
  const segments = result.segments;
  const wordsBySeg = bucketWordsBySegment(segments, result.words);
  const shouldRomanize = needsRomanization(result.language);
  const segmentLevelRomanize = isJapanese(result.language);

  const lines: LyricLine[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const line = segmentLevelRomanize
      ? await buildJapaneseLine(seg)
      : await buildPerWordLine(seg, wordsBySeg[i], result.language, shouldRomanize);
    if (line) lines.push(line);
  }
  return lines;
}
