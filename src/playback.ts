import { getApplications, open } from "@raycast/api";
import {
  buildSpotifyDashboardUrl,
  buildSpotifyTrackUri,
  buildSpotifyTrackUrl,
  buildYouTubeMusicSearchUrl,
} from "./safety";
import { isApplescriptSupported, playTrackWithAppleScript } from "./spotify-applescript";

export type PlaybackOutcome = "playing" | "opened";

const SPOTIFY_BUNDLE_ID = "com.spotify.client";
const SPOTIFY_MISSING_MESSAGE = "The Spotify desktop app is not installed on this Mac.";

export async function isSpotifyInstalled() {
  const applications = await getApplications();
  return applications.some((application) => application.bundleId === SPOTIFY_BUNDLE_ID);
}

export async function openSpotifyTrackInBrowser(trackId: string) {
  await open(buildSpotifyTrackUrl(trackId));
}

export async function openSpotifyDashboard() {
  await open(buildSpotifyDashboardUrl());
}

export async function openYouTubeMusicSearch(query: string) {
  await open(buildYouTubeMusicSearchUrl(query));
}

/**
 * Plays a track in the Spotify desktop app.
 *
 * Returns "playing" when AppleScript actually started playback, and "opened" when the
 * platform only supports the deeplink, which navigates to the track without auto-playing.
 */
export async function playSpotifyTrack(trackId: string): Promise<PlaybackOutcome> {
  // Validates the id up front, so an unusable value never reaches the app or a spawned process.
  const uri = buildSpotifyTrackUri(trackId);

  if (!isApplescriptSupported()) {
    await open(uri);
    return "opened";
  }

  if (!(await isSpotifyInstalled())) {
    throw new Error(SPOTIFY_MISSING_MESSAGE);
  }

  await playTrackWithAppleScript(trackId);
  return "playing";
}
