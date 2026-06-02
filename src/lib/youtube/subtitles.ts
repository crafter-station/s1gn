import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectSongLanguage } from '@/lib/transcribe/detect-language';
import { youtubeWatchUrl } from './url';

// Language priority for picking the best subtitle track.
// Asian languages first because the romaji output is the user-facing value for them.
const PRIORITY_LANGS = ['ko', 'ja', 'es', 'en'] as const;

export type SubCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type FetchedSubtitles = {
  language: string;
  cues: SubCue[];
  /** True when the chosen track is YouTube's auto-generated caption (not human-authored). */
  isAuto: boolean;
};

export type SubtitlesAndMeta = {
  title: string;
  durationSec: number;
  thumbnailUrl: string;
  /** Language reported by yt-dlp metadata (may be unreliable; we use sub availability instead). */
  declaredLanguage: string | null;
  subtitles: FetchedSubtitles | null;
};

export class SubtitlesFetchError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
    this.name = 'SubtitlesFetchError';
  }
}

/**
 * Two-step fetch designed to avoid YouTube's per-IP rate limit on the
 * auto-translation endpoint:
 *
 *   1. **Phase 1** — one yt-dlp call: metadata + **manual subs only** in our
 *      priority languages. Manual subs don't go through the translation
 *      service, so this never triggers 429. If a usable manual track exists
 *      we use it and stop here.
 *
 *   2. **Phase 2** — only if Phase 1 found nothing. One more yt-dlp call for
 *      the auto-caption track in **just** the video's declared source
 *      language. Single track = single download = no rate-limit explosion.
 *
 * Anything else (failure of Phase 1 entirely, or Phase 2 not applicable)
 * returns `subtitles: null`, which lets the caller fall back to Whisper.
 */
export async function fetchSubtitlesAndMeta(youtubeId: string): Promise<SubtitlesAndMeta> {
  const dir = await mkdtemp(join(tmpdir(), `s1ng-subs-${youtubeId}-`));
  try {
    // Phase 1: metadata + manual subs in priority languages. The wildcard
    // suffixes match regional variants (es-419, ja-JP, etc.) without
    // triggering auto-translation requests, since --write-auto-subs is OFF.
    const phase1Args = [
      '--skip-download',
      '--write-info-json',
      '--write-subs',
      '--sub-langs',
      'ko,ja,es,en,ko.*,ja.*,es.*,en.*',
      '--sub-format',
      'vtt',
      '--no-progress',
      '--no-playlist',
      '-o',
      join(dir, '%(id)s'),
      youtubeWatchUrl(youtubeId),
    ];

    const phase1 = await runYtdlp(phase1Args);
    if (phase1.code !== 0) {
      throw new SubtitlesFetchError(
        `yt-dlp exited with code ${phase1.code}: ${summarize(phase1.stderr)}`,
        phase1.stderr,
      );
    }

    const infoPath = join(dir, `${youtubeId}.info.json`);
    const info = await readJson(infoPath);

    const title: string = typeof info?.title === 'string' ? info.title : youtubeId;
    const durationSec: number =
      typeof info?.duration === 'number' ? Math.round(info.duration) : 0;
    const thumbnailUrl: string =
      typeof info?.thumbnail === 'string'
        ? info.thumbnail
        : `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
    const declaredLanguage: string | null =
      typeof info?.language === 'string' ? String(info.language) : null;
    const description: string | null =
      typeof info?.description === 'string' ? String(info.description) : null;

    const manualTracks: Record<string, unknown> =
      info?.subtitles && typeof info.subtitles === 'object'
        ? (info.subtitles as Record<string, unknown>)
        : {};

    // Detect the song's actual language. We try signals in order of accuracy:
    //   1. LLM analysis of title + description (handles covers, dubs, mixed
    //      titles like "Momoland - Baam Baam Japanese Version" where the
    //      song is JP but the artist & original are KR).
    //   2. Title script analysis (deterministic, free, handles ja/ko via
    //      Unicode ranges) — fallback when the LLM is unavailable.
    //   3. yt-dlp's `info.language` (uploader-tagged; often missing/wrong).
    const llmLang = await detectSongLanguage(title, description);
    const titleLang = llmLang ? null : detectLangFromTitle(title);
    const declaredBase = declaredLanguage
      ? declaredLanguage.toLowerCase().split(/[-.]/)[0]
      : null;
    const sourceLang =
      llmLang ??
      titleLang ??
      (declaredBase && (PRIORITY_LANGS as readonly string[]).includes(declaredBase)
        ? declaredBase
        : null);

    // Look for a manual sub we can use, preferring the detected source lang
    // over the default priority order.
    let picked = pickManualVtt(await readdir(dir), youtubeId, manualTracks, sourceLang);

    // Phase 2: no manual sub matched — try the auto-caption in the detected
    // source language. We deliberately don't fetch other languages because
    // they'd be machine-translated and labeled wrong.
    if (!picked && sourceLang) {
      const phase2Args = [
        '--skip-download',
        '--write-auto-subs',
        '--sub-langs',
        sourceLang,
        '--sub-format',
        'vtt',
        '--no-progress',
        '--no-playlist',
        '-o',
        join(dir, '%(id)s'),
        youtubeWatchUrl(youtubeId),
      ];
      const phase2 = await runYtdlp(phase2Args);
      if (phase2.code === 0) {
        const hit = findVttForBaseLang(await readdir(dir), youtubeId, sourceLang);
        if (hit) picked = { ...hit, lang: sourceLang, isManual: false };
      }
      // If phase 2 fails (429, network, etc.) fall through silently so the
      // caller can use Whisper. Don't fail the whole video.
    }

    if (!picked) {
      return { title, durationSec, thumbnailUrl, declaredLanguage, subtitles: null };
    }

    const vttRaw = await readFile(join(dir, picked.file), 'utf8');
    const cues = parseVtt(vttRaw);
    if (cues.length === 0) {
      return { title, durationSec, thumbnailUrl, declaredLanguage, subtitles: null };
    }

    return {
      title,
      durationSec,
      thumbnailUrl,
      declaredLanguage,
      subtitles: { language: picked.lang, cues, isAuto: !picked.isManual },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function isManualTrack(manualKeys: string[], fullLang: string): boolean {
  if (manualKeys.includes(fullLang)) return true;
  const baseLang = fullLang.split(/[-.]/)[0];
  return manualKeys.some((k) => k === baseLang || k.split(/[-.]/)[0] === baseLang);
}

function findVttForBaseLang(
  vttFiles: string[],
  youtubeId: string,
  baseLang: string,
): { file: string; fullLang: string } | null {
  const exact = vttFiles.find((f) => f === `${youtubeId}.${baseLang}.vtt`);
  if (exact) return { file: exact, fullLang: baseLang };

  const variant = vttFiles.find((f) => {
    const middle = f.slice(youtubeId.length + 1, -4);
    return middle.split(/[-.]/)[0] === baseLang;
  });
  if (variant) {
    return { file: variant, fullLang: variant.slice(youtubeId.length + 1, -4) };
  }
  return null;
}

/**
 * Pick a manual subtitle track. Tries the detected source language first
 * (e.g. for a Japanese song with both `ja` and `en` manual subs, pick `ja`
 * even though our default priority lists `ko` first), then falls back to
 * the default `PRIORITY_LANGS` order.
 */
function pickManualVtt(
  files: string[],
  youtubeId: string,
  manualTracks: Record<string, unknown>,
  sourceLang: string | null,
): { file: string; lang: string; fullLang: string; isManual: boolean } | null {
  const vttFiles = files.filter((f) => f.startsWith(`${youtubeId}.`) && f.endsWith('.vtt'));
  if (vttFiles.length === 0) return null;

  const manualKeys = Object.keys(manualTracks);
  const order: string[] = [];
  if (sourceLang && (PRIORITY_LANGS as readonly string[]).includes(sourceLang)) {
    order.push(sourceLang);
  }
  for (const l of PRIORITY_LANGS) if (!order.includes(l)) order.push(l);

  for (const baseLang of order) {
    const hit = findVttForBaseLang(vttFiles, youtubeId, baseLang);
    if (hit && isManualTrack(manualKeys, hit.fullLang)) {
      return { ...hit, lang: baseLang, isManual: true };
    }
  }
  return null;
}

/**
 * Detect the song's language from its title using script analysis.
 * Returns `null` for purely Latin titles where en/es can't be distinguished
 * by script alone (and where romanization is a no-op anyway).
 *
 * This is the most reliable signal we have — far more reliable than
 * yt-dlp's `info.language` (frequently missing or mis-tagged by uploaders).
 */
function detectLangFromTitle(title: string): 'ja' | 'ko' | null {
  let jaScore = 0;
  let koScore = 0;
  for (const ch of title) {
    const c = ch.codePointAt(0);
    if (!c) continue;
    if (c >= 0x3040 && c <= 0x309f) jaScore += 2;      // hiragana
    else if (c >= 0x30a0 && c <= 0x30ff) jaScore += 2; // katakana
    else if (c >= 0xac00 && c <= 0xd7a3) koScore += 2; // hangul syllables
    else if (c >= 0x1100 && c <= 0x11ff) koScore += 1; // hangul jamo
    else if (c >= 0x3130 && c <= 0x318f) koScore += 1; // hangul compat jamo
    else if (c >= 0x4e00 && c <= 0x9fff) jaScore += 1; // CJK ideographs (treat as ja in our domain)
  }
  if (koScore >= 2 && koScore >= jaScore) return 'ko';
  if (jaScore >= 2) return 'ja';
  return null;
}

const TIMESTAMP_RE = /(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/;

function parseVtt(content: string): SubCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const cues: SubCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    let tsIdx = -1;
    let tsMatch: RegExpMatchArray | null = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(TIMESTAMP_RE);
      if (m) {
        tsIdx = i;
        tsMatch = m;
        break;
      }
    }
    if (!tsMatch || tsIdx === -1) continue;

    const startMs = hmsToMs(tsMatch[1], tsMatch[2], tsMatch[3], tsMatch[4]);
    const endMs = hmsToMs(tsMatch[5], tsMatch[6], tsMatch[7], tsMatch[8]);
    if (endMs <= startMs) continue;

    const text = cleanCueText(lines.slice(tsIdx + 1).join(' '));
    if (!text) continue;

    cues.push({ startMs, endMs, text });
  }

  return dedupeCues(cues);
}

function cleanCueText(raw: string): string {
  return raw
    .replace(/<\d{1,2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<\/?c[^>]*>/g, '')
    .replace(/<v[^>]*>/g, '')
    .replace(/<\/v>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/♪/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * YouTube auto-subs emit "rolling" cues where the same line keeps growing
 * with each new word. Collapse runs where one cue's text is a strict prefix of
 * the next by keeping only the longest one in the run.
 */
function dedupeCues(cues: SubCue[]): SubCue[] {
  if (cues.length === 0) return cues;
  const out: SubCue[] = [];

  for (const cue of cues) {
    const last = out[out.length - 1];
    if (last && cue.text === last.text) {
      last.endMs = Math.max(last.endMs, cue.endMs);
      continue;
    }
    if (last && cue.text.startsWith(last.text) && cue.startMs <= last.endMs + 200) {
      // Rolling: replace previous with the longer version, keep its startMs.
      out[out.length - 1] = { startMs: last.startMs, endMs: cue.endMs, text: cue.text };
      continue;
    }
    out.push({ ...cue });
  }
  return out;
}

function hmsToMs(hh: string, mm: string, ss: string, fff: string): number {
  return (
    parseInt(hh, 10) * 3_600_000 +
    parseInt(mm, 10) * 60_000 +
    parseInt(ss, 10) * 1_000 +
    parseInt(fff, 10)
  );
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarize(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLine = [...lines].reverse().find((l) => l.startsWith('ERROR'));
  return (errorLine ?? lines[lines.length - 1] ?? 'no stderr output').slice(0, 400);
}

function runYtdlp(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) =>
      reject(new SubtitlesFetchError(`Failed to spawn yt-dlp: ${err.message}`)),
    );
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}
