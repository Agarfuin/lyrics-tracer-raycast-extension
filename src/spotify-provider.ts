import { rankCandidates } from "./match-ranking";
import { toSafeArtworkUrl } from "./safety";
import type { SpotifyCredentials, SpotifyTrack } from "./types";

type SpotifyApiArtist = { name?: string };
type SpotifyApiImage = { url?: string; width?: number };
type SpotifyApiTrack = {
  id?: string;
  name?: string;
  duration_ms?: number;
  explicit?: boolean;
  album?: { name?: string; images?: SpotifyApiImage[] };
  artists?: SpotifyApiArtist[];
};
type SpotifySearchResponse = { tracks?: { items?: SpotifyApiTrack[] } };

const SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search";

// Spotify capped `limit` at 10 (default 5) in the February 2026 Web API changes.
const SPOTIFY_SEARCH_LIMIT = "10";

function toSpotifyTrack(track: SpotifyApiTrack): SpotifyTrack | null {
  if (!track.id || !track.name) {
    return null;
  }

  const artist = (track.artists ?? [])
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const smallestImage = [...(track.album?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0];

  return {
    id: track.id,
    title: track.name.trim(),
    artist: artist || "Unknown Artist",
    album: track.album?.name?.trim(),
    durationMs: typeof track.duration_ms === "number" ? track.duration_ms : undefined,
    explicit: track.explicit === true,
    artworkUrl: toSafeArtworkUrl(smallestImage?.url),
  };
}

async function requestSearch(query: string, accessToken: string) {
  // Host and path are constants; the query only ever lands inside an encoded parameter value.
  const params = new URLSearchParams({ q: query, type: "track", limit: SPOTIFY_SEARCH_LIMIT });

  return fetch(`${SPOTIFY_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function toSearchError(status: number) {
  if (status === 403) {
    return new Error("This Spotify account is not allowed to use your developer app. Add it to the app's user list.");
  }

  if (status === 429) {
    return new Error("Spotify is rate limiting requests. Please try again in a moment.");
  }

  // Nothing from the response body reaches the user.
  return new Error("Spotify search is currently unavailable.");
}

export async function searchSpotifyTracks(query: string, credentials: SpotifyCredentials): Promise<SpotifyTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  let response = await requestSearch(trimmed, credentials.accessToken);

  // One silent retry with a refreshed token; anything beyond that is a real auth failure.
  if (response.status === 401) {
    const refreshedToken = await credentials.refresh();
    response = await requestSearch(trimmed, refreshedToken);
  }

  if (!response.ok) {
    throw toSearchError(response.status);
  }

  const payload = (await response.json()) as SpotifySearchResponse;
  const tracks = (payload.tracks?.items ?? [])
    .map(toSpotifyTrack)
    .filter((track): track is SpotifyTrack => track !== null);

  return rankCandidates(tracks, trimmed);
}
