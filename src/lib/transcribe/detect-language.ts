import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const SUPPORTED = ['ja', 'ko', 'es', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED)[number];

const ResponseSchema = z.object({
  language: z.enum(['ja', 'ko', 'es', 'en', 'other']),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().max(160),
});

/**
 * Ask an LLM what language the song's lyrics are actually in.
 *
 * The title alone is unreliable — a video titled "Momoland - Baam Baam Japanese
 * Version" is in Japanese even though the artist is Korean and the original
 * song is Korean. World knowledge fixes this where pure title-script analysis
 * cannot. We pass the description too for cover/dub videos that mention the
 * actual lyrics language there.
 *
 * Returns `null` if the LLM is unavailable, the language is outside our
 * supported set, or confidence is low — letting the caller fall back to
 * deterministic title-script detection.
 */
export async function detectSongLanguage(
  title: string,
  description: string | null,
): Promise<SupportedLanguage | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ResponseSchema,
      schemaName: 'SongLanguage',
      temperature: 0,
      prompt: buildPrompt(title, description),
    });

    if (object.confidence === 'low') return null;
    if (object.language === 'other') return null;
    return object.language;
  } catch {
    return null;
  }
}

function buildPrompt(title: string, description: string | null): string {
  const desc = description ? description.slice(0, 600).trim() : '';
  return [
    'Identify the language the song lyrics in this YouTube video are sung in.',
    '',
    'Important rules:',
    '- Return the language of the LYRICS, not the title.',
    '- If the title is in English but the song is in another language (e.g. "BTS - Dynamite (Korean cover)"), return the language of the actual sung lyrics.',
    '- For covers and dubs, return the LANGUAGE OF THIS RECORDING (e.g. "Momoland - Baam Baam Japanese Version" → ja, even though the original is Korean).',
    '- Return "other" only if the song is not in Japanese, Korean, Spanish, or English.',
    '- Use the description for additional clues (cover language, lyrics excerpts, original artist).',
    '',
    `Title: ${title}`,
    desc ? `Description: ${desc}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
