import { spawn } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { youtubeWatchUrl } from './url';

export type DownloadedAudio = {
  path: string;
  title: string;
  durationSec: number;
  thumbnailUrl: string;
};

export class YtdlpError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
    this.name = 'YtdlpError';
  }
}

export async function downloadAudio(youtubeId: string): Promise<DownloadedAudio> {
  const dir = await mkdtemp(join(tmpdir(), `s1ng-${youtubeId}-`));
  const outputTemplate = join(dir, `${youtubeId}.%(ext)s`);

  const args = [
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '--no-progress',
    '--no-playlist',
    '--print-json',
    '-o',
    outputTemplate,
    youtubeWatchUrl(youtubeId),
  ];

  const { stdout, stderr, code } = await runYtdlp(args);
  if (code !== 0) {
    throw new YtdlpError(`yt-dlp exited with code ${code}: ${summarizeStderr(stderr)}`, stderr);
  }

  const meta = parseLastJsonLine(stdout);
  const title: string = typeof meta?.title === 'string' ? meta.title : youtubeId;
  const durationSec: number = typeof meta?.duration === 'number' ? Math.round(meta.duration) : 0;
  const thumbnailUrl: string =
    typeof meta?.thumbnail === 'string'
      ? meta.thumbnail
      : `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

  const files = await readdir(dir);
  const mp3 = files.find((f) => f.endsWith('.mp3'));
  if (!mp3) throw new YtdlpError('yt-dlp did not produce an mp3 file', stderr);

  return { path: join(dir, mp3), title, durationSec, thumbnailUrl };
}

function runYtdlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) => reject(new YtdlpError(`Failed to spawn yt-dlp: ${err.message}`)));
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

function summarizeStderr(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLine = [...lines].reverse().find((l) => l.startsWith('ERROR'));
  const tail = (errorLine ?? lines[lines.length - 1] ?? '').slice(0, 400);
  return tail || 'no stderr output';
}

function parseLastJsonLine(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as Record<string, unknown>;
    } catch {
      // try previous line
    }
  }
  return null;
}
