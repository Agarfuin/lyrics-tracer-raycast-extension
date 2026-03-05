import { LocalStorage } from "@raycast/api";
import { SongSearchResult } from "./types";
import { normalizeKeyPart } from "./transform";

const LAST_INDEX_PREFIX = "lyricsTracer:lastIndex:v2:";
const LEGACY_LAST_INDEX_PREFIX = "lyricsTracer:lastIndex:";

export type SavedProgress = {
  index: number;
  lineText?: string;
};

function normalizeProgressKey(input: string) {
  const normalized = normalizeKeyPart(input);
  return normalized || "unknown";
}

export function buildProgressKeys(song: SongSearchResult, query?: string) {
  const keys: string[] = [];

  if (song.id && song.id.trim()) {
    keys.push(`song-id:${song.id.trim()}`);
  }

  const artist = normalizeProgressKey(song.artist || "unknown-artist");
  const title = normalizeProgressKey(song.title || "unknown-title");
  keys.push(`song-name:${artist}::${title}`);

  // Keep query as a low-priority alias for backward compatibility.
  if (query && query.trim()) {
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
