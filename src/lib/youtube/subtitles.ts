import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

export async function fetchSubtitlesAndMeta(youtubeId: string): Promise<SubtitlesAndMeta> {
  const dir = await mkdtemp(join(tmpdir(), `s1ng-subs-${youtubeId}-`));
  try {
    const args = [
      '--skip-download',
      '--write-info-json',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      // Comma list of preferred langs + common variants.
      // yt-dlp will write any that exist; we pick the best afterwards.
      'ko,ko-KR,ja,ja-JP,es,es-419,es-ES,en,en-US,en-GB,en-orig',
      '--sub-format',
      'vtt',
      '--no-progress',
      '--no-playlist',
      '-o',
      join(dir, '%(id)s'),
      youtubeWatchUrl(youtubeId),
    ];

    const { stderr, code } = await runYtdlp(args);
    if (code !== 0) {
      throw new SubtitlesFetchError(
        `yt-dlp exited with code ${code}: ${summarize(stderr)}`,
        stderr,
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

    const manualTracks: Record<string, unknown> =
      info?.subtitles && typeof info.subtitles === 'object'
        ? (info.subtitles as Record<string, unknown>)
        : {};

    const files = await readdir(dir);
    const picked = pickBestVtt(files, youtubeId);

    if (!picked) {
      return { title, durationSec, thumbnailUrl, declaredLanguage, subtitles: null };
    }

    const vttRaw = await readFile(join(dir, picked.file), 'utf8');
    const cues = parseVtt(vttRaw);
    if (cues.length === 0) {
      return { title, durationSec, thumbnailUrl, declaredLanguage, subtitles: null };
    }

    const isAuto = !manualTracks[picked.fullLang] && !manualTracks[picked.lang];

    return {
      title,
      durationSec,
      thumbnailUrl,
      declaredLanguage,
      subtitles: { language: picked.lang, cues, isAuto },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function pickBestVtt(
  files: string[],
  youtubeId: string,
): { file: string; lang: string; fullLang: string } | null {
  const vttFiles = files.filter((f) => f.startsWith(`${youtubeId}.`) && f.endsWith('.vtt'));
  if (vttFiles.length === 0) return null;

  for (const baseLang of PRIORITY_LANGS) {
    // Prefer the exact base lang, fall back to any regional variant (e.g. "es-419").
    const exact = vttFiles.find((f) => f === `${youtubeId}.${baseLang}.vtt`);
    if (exact) return { file: exact, lang: baseLang, fullLang: baseLang };

    const variant = vttFiles.find((f) => {
      const middle = f.slice(youtubeId.length + 1, -4);
      return middle.split(/[-.]/)[0] === baseLang;
    });
    if (variant) {
      const fullLang = variant.slice(youtubeId.length + 1, -4);
      return { file: variant, lang: baseLang, fullLang };
    }
  }
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
