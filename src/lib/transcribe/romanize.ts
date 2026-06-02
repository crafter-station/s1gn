type KuroshiroInstance = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (text: string, opts: { to: string; mode?: string }) => Promise<string>;
};

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;

async function getKuroshiro(): Promise<KuroshiroInstance> {
  if (!kuroshiroPromise) {
    kuroshiroPromise = (async () => {
      const KuroshiroMod = (await import('kuroshiro')) as unknown as {
        default: new () => KuroshiroInstance;
      };
      const AnalyzerMod = (await import('kuroshiro-analyzer-kuromoji')) as unknown as {
        default: new () => unknown;
      };
      const instance = new KuroshiroMod.default();
      await instance.init(new AnalyzerMod.default());
      return instance;
    })();
  }
  return kuroshiroPromise;
}

let koreanRomanize: ((text: string) => string) | null = null;
async function getKoreanRomanize(): Promise<(text: string) => string> {
  if (!koreanRomanize) {
    const mod = (await import('hangul-romanization')) as unknown as {
      convert?: (text: string) => string;
      default?: { convert?: (text: string) => string };
    };
    koreanRomanize = mod.convert ?? mod.default?.convert ?? null;
    if (!koreanRomanize) throw new Error('hangul-romanization: convert export not found');
  }
  return koreanRomanize;
}

export function needsRomanization(language: string): boolean {
  return language === 'ja' || language === 'japanese' || language === 'ko' || language === 'korean';
}

function normalizeLang(language: string): 'ja' | 'ko' | null {
  if (language === 'ja' || language === 'japanese') return 'ja';
  if (language === 'ko' || language === 'korean') return 'ko';
  return null;
}

export async function romanize(text: string, language: string): Promise<string> {
  const lang = normalizeLang(language);
  if (!lang || !text) return text;

  if (lang === 'ja') {
    const kuro = await getKuroshiro();
    return (await kuro.convert(text, { to: 'romaji', mode: 'spaced' })).trim();
  }

  const rom = await getKoreanRomanize();
  return rom(text).trim();
}

export async function romanizeMany(items: string[], language: string): Promise<string[]> {
  if (!needsRomanization(language)) return items;
  const out: string[] = [];
  for (const item of items) out.push(await romanize(item, language));
  return out;
}
