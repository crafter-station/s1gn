export type VideoStatus = 'processing' | 'ready' | 'failed';

export type LyricWord = {
  text: string;
  startMs: number;
  endMs: number;
};

export type LyricLine = {
  startMs: number;
  endMs: number;
  words: LyricWord[];
};

export type Video = {
  id: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  durationSec: number;
  language: string | null;
  status: VideoStatus;
  errorMessage: string | null;
  lyrics: LyricLine[] | null;
  ownerFingerprintHash: string | null;
  createdAt: Date;
};

export type NewVideo = {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  durationSec: number;
  status: VideoStatus;
  ownerFingerprintHash?: string | null;
};
