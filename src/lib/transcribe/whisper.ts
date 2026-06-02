import { createReadStream } from 'node:fs';
import OpenAI from 'openai';

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export type WhisperWord = { word: string; start: number; end: number };
export type WhisperSegment = { start: number; end: number; text: string };
export type WhisperResult = {
  language: string;
  segments: WhisperSegment[];
  words: WhisperWord[];
};

export async function transcribe(filePath: string): Promise<WhisperResult> {
  const res = await openai().audio.transcriptions.create({
    file: createReadStream(filePath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  const raw = res as unknown as {
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
  };

  return {
    language: raw.language ?? 'en',
    segments: raw.segments ?? [],
    words: raw.words ?? [],
  };
}
