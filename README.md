# s1ng

Karaoke from any YouTube link. Paste a URL, get a synced 2-line player with word-level highlighting. Japanese and Korean output in romaji.

## Requirements

System binaries on `PATH`:
- `yt-dlp`
- `ffmpeg`

Services:
- PostgreSQL
- Redis

Account:
- OpenAI API key (Whisper)

## Setup

```bash
cp .env.example .env       # fill in OPENAI_API_KEY; adjust DB/Redis URLs if needed
pnpm install
pnpm db:push               # apply the Drizzle schema
pnpm dev
```

Open http://localhost:3000.

## How it works

1. Paste a YouTube URL on the home page.
2. The server action calls `yt-dlp` once to fetch the video metadata **and** any available subtitle tracks (manual or auto-generated), in priority order `ko → ja → es → en`. If a suitable subtitle track is found, it's used as the source of truth — much more accurate than Whisper, especially for non-English music with mixed-language lyrics (e.g. K-pop with embedded English phrases). The full audio download and Whisper call are skipped.
3. If no usable subtitles exist, fall back to: download audio with `yt-dlp`, transcribe with the Whisper API (`verbose_json`, word-level timestamps).
4. For `ja`/`ko` lyrics, the text is romanized via kuroshiro (Japanese, segment-level for context) or hangul-romanization (Korean, character-level). Latin characters (English / Spanish words within Korean lyrics, for instance) pass through unchanged.
5. The result is stored in Postgres (one `videos` row, lyrics as a `jsonb` blob).
6. The karaoke page embeds the YouTube IFrame Player and uses a `requestAnimationFrame` loop on `getCurrentTime()` to highlight the active word and preview the next line.

## Architecture

```
src/
  app/                       — App Router pages + server action
  components/                — AddVideoForm, VideoCard, KaraokePlayer, KaraokeLines
  lib/
    db/                      — Drizzle schema + postgres-js client
    redis.ts                 — ioredis singleton (dedup lock)
    youtube/                 — URL parsing, yt-dlp audio wrapper, subtitle fetch + VTT parser
    transcribe/              — Whisper + romanize + line builders (per-word Whisper / segment Whisper / subtitle cues)
    repositories/            — VideoRepository interface + Drizzle implementation
  types/                     — shared domain types
```

Persistence is behind a `VideoRepository` interface — swap the Drizzle implementation without touching the app code.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript without emit |
| `pnpm db:generate` | Generate SQL migrations from the schema |
| `pnpm db:push` | Push schema directly to the dev DB |
| `pnpm db:migrate` | Apply generated migrations |

## Notes

- Processing happens **synchronously** in the server action. A request will block for the length of the download + Whisper round-trip (typically 1–3 min for a 4 min song). A Redis `SETNX` lock prevents two concurrent submissions of the same video from doing the work twice.
- Re-submitting an existing URL skips processing and redirects to the existing karaoke page.
- The lyrics blob is loaded all-at-once on the karaoke page; the player does its own client-side scheduling with `requestAnimationFrame`.
