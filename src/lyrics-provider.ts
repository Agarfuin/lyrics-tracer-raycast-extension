import { LyricsLine, SongSearchResult } from "./types";

type LrcLibTrack = {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
};

type ParsedQuery = {
  titleQuery: string;
  artistQuery?: string;
};

const LRCLIB_BASE_URL = "https://lrclib.net/api";
const VARIANT_MARKERS = [
  "live",
  "karaoke",
  "cover",
  "remix",
  "acoustic",
  "instrumental",
  "sped up",
  "nightcore",
  "tribute",
  "demo",
  "version",
  "edit",
  "re-recorded",
  "remastered",
];

function normalizeForMatch(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDecorators(input: string) {
  return normalizeForMatch(input)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSongQuery(query: string): ParsedQuery {
  const trimmed = query.trim();

  const byIdx = trimmed.toLowerCase().lastIndexOf(" by ");
  if (byIdx > 0) {
    const titleQuery = trimmed.slice(0, byIdx).trim();
    const artistQuery = trimmed.slice(byIdx + 4).trim();
    if (titleQuery && artistQuery) {
      return { titleQuery, artistQuery };
    }
  }

  const dashMatch = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    const titleQuery = dashMatch[1].trim();
    const artistQuery = dashMatch[2].trim();
    if (titleQuery && artistQuery) {
      return { titleQuery, artistQuery };
    }
  }

  return { titleQuery: trimmed };
}

function toSongResult(track: LrcLibTrack): SongSearchResult {
  return {
    id: track.id ? String(track.id) : undefined,
    title: (track.trackName || "Unknown Title").trim(),
    artist: (track.artistName || "Unknown Artist").trim(),
    album: track.albumName?.trim(),
    duration: track.duration,
    plainLyrics: track.plainLyrics,
    syncedLyrics: track.syncedLyrics,
  };
}

function parseSyncedLyrics(syncedLyrics: string) {
  return syncedLyrics
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[^\]]*\]\s*/, "").trimEnd())
    .filter((line) => line.trim().length > 0);
}

function parsePlainLyrics(plainLyrics: string) {
  return plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function toLyricsLines(lines: string[]): LyricsLine[] {
  return lines.map((text, index) => ({ index, text }));
}

function hasVariantMarker(input: string) {
  const normalized = normalizeForMatch(input);
  return VARIANT_MARKERS.some((marker) => normalized.includes(marker));
}

function scoreCandidate(song: SongSearchResult, parsed: ParsedQuery) {
  const queryTitle = normalizeForMatch(parsed.titleQuery);
  const songTitle = normalizeForMatch(song.title);
  const baseSongTitle = stripDecorators(song.title);

  let score = 0;

  if (baseSongTitle === queryTitle) {
    score += 220;
  } else if (songTitle === queryTitle) {
    score += 180;
  } else if (baseSongTitle.startsWith(queryTitle)) {
    score += 130;
  } else if (songTitle.includes(queryTitle)) {
    score += 80;
  }

  if (parsed.artistQuery) {
    const queryArtist = normalizeForMatch(parsed.artistQuery);
    const songArtist = normalizeForMatch(song.artist);

    if (songArtist === queryArtist) {
      score += 200;
    } else if (songArtist.includes(queryArtist) || queryArtist.includes(songArtist)) {
      score += 120;
    }
  }

  if (!hasVariantMarker(song.title)) {
    score += 25;
  } else {
    score -= 90;
  }

  if (hasVariantMarker(song.artist)) {
    score -= 70;
  }

  return score;
}

async function fetchTrackById(id: string) {
  const response = await fetch(`${LRCLIB_BASE_URL}/get/${encodeURIComponent(id)}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as LrcLibTrack;
}

async function fetchTrackByMetadata(song: SongSearchResult) {
  const query = new URLSearchParams({
    track_name: song.title,
    artist_name: song.artist,
  });

  if (song.album) {
    query.set("album_name", song.album);
  }

  if (typeof song.duration === "number") {
    query.set("duration", String(Math.round(song.duration)));
  }

  const response = await fetch(`${LRCLIB_BASE_URL}/get?${query.toString()}`);
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LrcLibTrack;
}

export async function searchSongs(query: string): Promise<SongSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const response = await fetch(`${LRCLIB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}`);
  if (!response.ok) {
    throw new Error(`Song search failed with status ${response.status}`);
  }

  const tracks = (await response.json()) as LrcLibTrack[];
  return tracks.map(toSongResult);
}

export async function resolveSongFromQuery(query: string): Promise<SongSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Please provide a song name argument.");
  }

  const candidates = await searchSongs(trimmed);
  if (candidates.length === 0) {
    throw new Error("No matching songs found.");
  }

  const parsed = parseSongQuery(trimmed);
  const ranked = candidates
    .map((song) => ({ song, score: scoreCandidate(song, parsed) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0].song;
}

export async function fetchLyrics(song: SongSearchResult): Promise<LyricsLine[]> {
  let source: LrcLibTrack | SongSearchResult | null = song;

  if (
    (!song.plainLyrics || song.plainLyrics.trim().length === 0) &&
    (!song.syncedLyrics || song.syncedLyrics.trim().length === 0)
  ) {
    source = null;

    if (song.id) {
      source = await fetchTrackById(song.id);
    }

    if (!source) {
      source = await fetchTrackByMetadata(song);
    }
  }

  const plain = source?.plainLyrics?.trim();
  if (plain) {
    return toLyricsLines(parsePlainLyrics(plain));
  }

  const synced = source?.syncedLyrics?.trim();
  if (synced) {
    return toLyricsLines(parseSyncedLyrics(synced));
  }

  return [];
}
