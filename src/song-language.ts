/**
 * Decides whether a song is mainly English, from a small sample of its lines.
 *
 * This module has no run-time imports so the decision rules stay easy to test on their own.
 */

const DETECTION_SAMPLE_SIZE = 5;
const MIN_SAMPLE_LENGTH = 12;

export type LanguageSample = { language: string } | { english: true } | { unknown: true };

export type MainLanguage = {
  isEnglish: boolean;
  language?: string;
};

/**
 * Picks the lines worth spending a detection request on: the longest distinct lines, which
 * carry the most signal. Falls back to shorter ones when a song has only short lines.
 */
export function pickDetectionSamples(lines: string[], sampleSize = DETECTION_SAMPLE_SIZE): string[] {
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
  const longEnough = unique.filter((line) => line.length >= MIN_SAMPLE_LENGTH);
  const pool = longEnough.length > 0 ? longEnough : unique;

  return [...pool].sort((a, b) => b.length - a.length).slice(0, sampleSize);
}

/**
 * Majority vote over the samples. A song counts as non-English only when more samples were
 * detected as some other language than were detected as English, so a mostly-English song with
 * a few foreign lines is still treated as English.
 */
export function decideMainLanguage(samples: LanguageSample[]): MainLanguage {
  const counts = new Map<string, number>();
  let englishCount = 0;

  for (const sample of samples) {
    if ("english" in sample) {
      englishCount += 1;
      continue;
    }

    if ("language" in sample) {
      const language = sample.language.trim().toLowerCase();
      if (!language) {
        continue;
      }

      if (language.startsWith("en")) {
        englishCount += 1;
        continue;
      }

      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }

  let dominant: string | undefined;
  let dominantCount = 0;

  for (const [language, count] of counts) {
    if (count > dominantCount) {
      dominant = language;
      dominantCount = count;
    }
  }

  if (!dominant || dominantCount <= englishCount) {
    return { isEnglish: true };
  }

  return { isEnglish: false, language: dominant };
}
