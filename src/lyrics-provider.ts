import { rankCandidates } from "./match-ranking";
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

const LRCLIB_BASE_URL = "https://lrclib.net/api";

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

  return rankCandidates(candidates, trimmed)[0];
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
