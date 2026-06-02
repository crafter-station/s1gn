const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export class InvalidYoutubeUrlError extends Error {
  constructor(input: string) {
    super(`Not a recognizable YouTube URL or video id: ${input}`);
    this.name = 'InvalidYoutubeUrlError';
  }
}

export function parseYoutubeId(input: string): string {
  const raw = input.trim();
  if (!raw) throw new InvalidYoutubeUrlError(input);

  if (ID_RE.test(raw)) return raw;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new InvalidYoutubeUrlError(input);
  }

  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id && ID_RE.test(id)) return id;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;

    const segments = u.pathname.split('/').filter(Boolean);
    const head = segments[0];
    if ((head === 'shorts' || head === 'embed' || head === 'live') && segments[1]) {
      const id = segments[1];
      if (ID_RE.test(id)) return id;
    }
  }

  throw new InvalidYoutubeUrlError(input);
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
