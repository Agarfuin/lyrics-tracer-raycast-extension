import { LocalStorage } from "@raycast/api";
import { buildTextCacheKey } from "./cache-key";
import { EnglishTranslation, LyricsLine, SongSearchResult } from "./types";
import { normalizeKeyPart } from "./transform";

const LAST_INDEX_PREFIX = "lyricsTracer:lastIndex:v2:";
const LEGACY_LAST_INDEX_PREFIX = "lyricsTracer:lastIndex:";
const TRANSLATION_CACHE_PREFIX = "lyricsTracer:translation:v1:";
const LINE_TRANSLATION_PREFIX = "lyricsTracer:lineTranslation:v2:";
const SONG_LANGUAGE_PREFIX = "lyricsTracer:songLanguage:v1:";

export type SavedProgress = {
  index: number;
  lineText?: string;
};

function normalizeProgressKey(input: string) {
  const normalized = normalizeKeyPart(input);
  return normalized || "unknown";
}

function buildTranslationCacheKey(songKey: string, line: LyricsLine) {
  const normalizedLineText = normalizeProgressKey(line.text || "blank");
  return `${songKey}::line:${line.index}::text:${normalizedLineText}`;
}

export function buildProgressKeys(song: SongSearchResult, query?: string) {
  const keys: string[] = [];

  if (song.id?.trim()) {
    keys.push(`song-id:${song.id.trim()}`);
  }

  const artist = normalizeProgressKey(song.artist || "unknown-artist");
  const title = normalizeProgressKey(song.title || "unknown-title");
  keys.push(`song-name:${artist}::${title}`);

  // Keep query as a low-priority alias for backward compatibility.
  if (query?.trim()) {
    keys.push(`query:${normalizeProgressKey(query)}`);
  }

  return [...new Set(keys)];
}

function parseSavedProgress(raw: unknown): SavedProgress | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  const legacyValue = Number(raw);
  if (!Number.isNaN(legacyValue) && legacyValue >= 0) {
    return { index: legacyValue };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
    if (typeof parsed.index !== "number" || Number.isNaN(parsed.index) || parsed.index < 0) {
      return null;
    }

    if (parsed.lineText !== undefined && typeof parsed.lineText !== "string") {
      return null;
    }

    return {
      index: parsed.index,
      lineText: parsed.lineText,
    };
  } catch {
    return null;
  }
}

function parseCachedTranslation(raw: unknown): EnglishTranslation | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<EnglishTranslation>;
    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
      return null;
    }

    if (parsed.detectedSourceLanguage !== undefined && typeof parsed.detectedSourceLanguage !== "string") {
      return null;
    }

    if (parsed.provider !== "mymemory") {
      return null;
    }

    return {
      text: parsed.text,
      detectedSourceLanguage: parsed.detectedSourceLanguage,
      provider: parsed.provider,
    };
  } catch {
    return null;
  }
}

export async function getSavedProgress(keys: string[]): Promise<SavedProgress | null> {
  for (const key of keys) {
    const currentRaw = await LocalStorage.getItem(`${LAST_INDEX_PREFIX}${key}`);
    const currentParsed = parseSavedProgress(currentRaw);
    if (currentParsed) {
      return currentParsed;
    }

    const legacyRaw = await LocalStorage.getItem(`${LEGACY_LAST_INDEX_PREFIX}${key}`);
    const parsed = parseSavedProgress(legacyRaw);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export async function setSavedProgress(keys: string[], progress: SavedProgress) {
  if (keys.length === 0) {
    return;
  }

  const serialized = JSON.stringify(progress);
  await Promise.all(
    keys.flatMap((key) => [
      LocalStorage.setItem(`${LAST_INDEX_PREFIX}${key}`, serialized),
      LocalStorage.setItem(`${LEGACY_LAST_INDEX_PREFIX}${key}`, String(progress.index)),
    ]),
  );
}

export async function getCachedTranslation(keys: string[], line: LyricsLine): Promise<EnglishTranslation | null> {
  for (const key of keys) {
    const raw = await LocalStorage.getItem(`${TRANSLATION_CACHE_PREFIX}${buildTranslationCacheKey(key, line)}`);
    const parsed = parseCachedTranslation(raw);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export async function setCachedTranslation(keys: string[], line: LyricsLine, translation: EnglishTranslation) {
  if (keys.length === 0) {
    return;
  }

  const serialized = JSON.stringify(translation);
  await Promise.all(
    keys.map((key) =>
      LocalStorage.setItem(`${TRANSLATION_CACHE_PREFIX}${buildTranslationCacheKey(key, line)}`, serialized),
    ),
  );
}

/**
 * Translation of one lyric line, keyed by the line text alone.
 *
 * Songs repeat their chorus, so keying by text rather than position means a repeated line is
 * only ever paid for once, and stays cached across songs that share a line.
 */
export type CachedLineTranslation = {
  text?: string;
  isEnglish: boolean;
};

function buildLineTranslationKey(lineText: string) {
  return `${LINE_TRANSLATION_PREFIX}${buildTextCacheKey(lineText)}`;
}

function parseCachedLineTranslation(raw: unknown): CachedLineTranslation | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CachedLineTranslation>;

    if (parsed.isEnglish === true) {
      return { isEnglish: true };
    }

    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
      return null;
    }

    return { text: parsed.text, isEnglish: false };
  } catch {
    return null;
  }
}

export async function getCachedLineTranslation(lineText: string): Promise<CachedLineTranslation | null> {
  return parseCachedLineTranslation(await LocalStorage.getItem(buildLineTranslationKey(lineText)));
}

export async function setCachedLineTranslation(lineText: string, value: CachedLineTranslation) {
  await LocalStorage.setItem(buildLineTranslationKey(lineText), JSON.stringify(value));
}

export async function getCachedSongLanguage(keys: string[]): Promise<string | null> {
  for (const key of keys) {
    const raw = await LocalStorage.getItem(`${SONG_LANGUAGE_PREFIX}${key}`);
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }

  return null;
}

export async function setCachedSongLanguage(keys: string[], language: string) {
  await Promise.all(keys.map((key) => LocalStorage.setItem(`${SONG_LANGUAGE_PREFIX}${key}`, language)));
}
