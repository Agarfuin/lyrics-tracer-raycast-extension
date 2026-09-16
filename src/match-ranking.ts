import type { ParsedSongQuery, RankableTrack } from "./types";

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

export function normalizeForMatch(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripDecorators(input: string) {
  return normalizeForMatch(input)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSongQuery(query: string): ParsedSongQuery {
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

export function hasVariantMarker(input: string) {
  const normalized = normalizeForMatch(input);
  return VARIANT_MARKERS.some((marker) => normalized.includes(marker));
}

export function scoreCandidate(song: RankableTrack, parsed: ParsedSongQuery) {
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

// Array.prototype.sort is stable, so ties preserve the provider's own relevance order.
export function rankCandidates<T extends RankableTrack>(candidates: T[], query: string): T[] {
  const parsed = parseSongQuery(query);

  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, parsed) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
}
