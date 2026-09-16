import {
  getCachedLineTranslation,
  getCachedSongLanguage,
  setCachedLineTranslation,
  setCachedSongLanguage,
} from "./storage";
import { LanguageSample, decideMainLanguage, pickDetectionSamples } from "./song-language";
import { translateLine } from "./translation-provider";
import type { LyricsLine } from "./types";

type TranslationPreferences = {
  translationContactEmail?: string;
};

type TranslateSongOptions = {
  lines: LyricsLine[];
  songKeys: string[];
  preferences: TranslationPreferences;
  isCancelled: () => boolean;
  onTranslated: (lineText: string, translation: string) => void;
  onQuotaExceeded: (message: string) => void;
};

const ENGLISH_LANGUAGE = "en";
const TRANSLATION_CONCURRENCY = 3;

async function classifySample(text: string, preferences: TranslationPreferences): Promise<LanguageSample> {
  const cached = await getCachedLineTranslation(text);
  if (cached) {
    return cached.isEnglish ? { english: true } : { unknown: true };
  }

  const outcome = await translateLine(text, preferences);

  if (outcome.status === "already-english") {
    await setCachedLineTranslation(text, { isEnglish: true });
    return { english: true };
  }

  if (outcome.status === "translated") {
    await setCachedLineTranslation(text, { text: outcome.translation.text, isEnglish: false });
    const language = outcome.translation.detectedSourceLanguage;
    return language ? { language } : { unknown: true };
  }

  return { unknown: true };
}

/**
 * Works out the song's main language, reusing a cached answer when the song was opened before.
 *
 * Detection is not free, so it samples a handful of lines instead of the whole song. Those
 * sample translations are cached, so nothing is wasted when the song does get translated.
 */
async function resolveMainLanguage(options: TranslateSongOptions) {
  const cached = await getCachedSongLanguage(options.songKeys);
  if (cached) {
    return { isEnglish: cached === ENGLISH_LANGUAGE, language: cached };
  }

  const samples = pickDetectionSamples(options.lines.map((line) => line.text));
  const classified: LanguageSample[] = [];

  for (const sample of samples) {
    if (options.isCancelled()) {
      return null;
    }

    classified.push(await classifySample(sample, options.preferences));
  }

  const decided = decideMainLanguage(classified);
  await setCachedSongLanguage(options.songKeys, decided.isEnglish ? ENGLISH_LANGUAGE : (decided.language ?? "unknown"));

  return decided;
}

async function runWorkers<T>(items: T[], worker: (item: T) => Promise<boolean>) {
  let index = 0;
  let stopped = false;

  async function next(): Promise<void> {
    while (!stopped) {
      const current = index;
      index += 1;

      if (current >= items.length) {
        return;
      }

      if (!(await worker(items[current]))) {
        stopped = true;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(TRANSLATION_CONCURRENCY, items.length) }, next));
}

/**
 * Fills in English translations for a non-English song, line by line, reporting each one as it
 * arrives so the list can populate progressively.
 *
 * Only distinct lines are translated: a repeated chorus costs a single request.
 */
export async function translateSongLines(options: TranslateSongOptions) {
  const language = await resolveMainLanguage(options);

  if (!language || language.isEnglish || options.isCancelled()) {
    return;
  }

  const uniqueTexts = [...new Set(options.lines.map((line) => line.text.trim()).filter(Boolean))];

  await runWorkers(uniqueTexts, async (text) => {
    if (options.isCancelled()) {
      return false;
    }

    const cached = await getCachedLineTranslation(text);
    if (cached) {
      if (cached.text) {
        options.onTranslated(text, cached.text);
      }

      return true;
    }

    const outcome = await translateLine(text, options.preferences);

    if (outcome.status === "already-english") {
      await setCachedLineTranslation(text, { isEnglish: true });
      return true;
    }

    if (outcome.status === "translated") {
      await setCachedLineTranslation(text, { text: outcome.translation.text, isEnglish: false });
      if (!options.isCancelled()) {
        options.onTranslated(text, outcome.translation.text);
      }

      return true;
    }

    // Stop the whole batch on a quota failure; continuing would just burn requests.
    if (outcome.quotaExceeded) {
      options.onQuotaExceeded(outcome.message);
      return false;
    }

    return true;
  });
}
