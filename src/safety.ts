/**
 * Single choke point for every untrusted value that leaves this extension, either as a URL
 * handed to the system opener or as a token interpolated into an AppleScript command.
 *
 * This module deliberately has no imports at run time, so the whole trusted surface is
 * auditable and testable on its own.
 */

const ALLOWED_OPEN_HOSTS = ["open.spotify.com", "music.youtube.com", "developer.spotify.com", "accounts.spotify.com"];
const SPOTIFY_IMAGE_HOSTS = ["i.scdn.co", "mosaic.scdn.co"];
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

const SPOTIFY_TRACK_URL_PREFIX = "https://open.spotify.com/track/";
const YOUTUBE_MUSIC_SEARCH_URL = "https://music.youtube.com/search";
const SPOTIFY_DASHBOARD_URL = "https://developer.spotify.com/dashboard";

export const SPOTIFY_AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

// Spotify returns a base64url-ish code. Anything outside this alphabet is rejected rather
// than forwarded to the token endpoint.
const AUTHORIZATION_CODE_PATTERN = /^[A-Za-z0-9._~-]{16,512}$/;
const INVALID_CODE_MESSAGE = "That does not look like a Spotify authorization code.";

const UNOPENABLE_URL_MESSAGE = "This link cannot be opened.";
const INVALID_TRACK_MESSAGE = "This track cannot be played.";

export function isSpotifyTrackId(value: string) {
  return SPOTIFY_TRACK_ID_PATTERN.test(value);
}

// Exact host equality on purpose: no endsWith, no subdomain wildcards, no scheme other than https.
function isAllowedUrl(parsed: URL, allowedHosts: string[]) {
  return parsed.protocol === "https:" && allowedHosts.includes(parsed.hostname);
}

export function assertOpenableUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(UNOPENABLE_URL_MESSAGE);
  }

  if (!isAllowedUrl(parsed, ALLOWED_OPEN_HOSTS)) {
    throw new Error(UNOPENABLE_URL_MESSAGE);
  }

  return parsed.toString();
}

// Album art comes from an API response, so it is untrusted input for Raycast's image loader.
export function toSafeArtworkUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(rawUrl);
    return isAllowedUrl(parsed, SPOTIFY_IMAGE_HOSTS) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function buildSpotifyTrackUrl(trackId: string) {
  if (!isSpotifyTrackId(trackId)) {
    throw new Error(INVALID_TRACK_MESSAGE);
  }

  return assertOpenableUrl(`${SPOTIFY_TRACK_URL_PREFIX}${trackId}`);
}

export function buildSpotifyTrackUri(trackId: string) {
  if (!isSpotifyTrackId(trackId)) {
    throw new Error(INVALID_TRACK_MESSAGE);
  }

  return `spotify:track:${trackId}`;
}

// The query is only ever encoded into a value position, so it cannot alter the query string.
export function buildYouTubeMusicSearchUrl(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Please provide a song name.");
  }

  const params = new URLSearchParams({ q: trimmed });
  return assertOpenableUrl(`${YOUTUBE_MUSIC_SEARCH_URL}?${params.toString()}`);
}

export function buildPlayTrackScript(trackId: string) {
  // trackId is allow-listed to /^[A-Za-z0-9]{22}$/, so it provably cannot contain a quote,
  // a backslash or a newline, and cannot break out of the AppleScript string literal.
  // Nothing derived from the user's typed query is ever interpolated here.
  const uri = buildSpotifyTrackUri(trackId);
  return ['tell application "Spotify"', `\tplay track "${uri}"`, "end tell"].join("\n");
}

export function buildSpotifyDashboardUrl() {
  return assertOpenableUrl(SPOTIFY_DASHBOARD_URL);
}

type AuthorizeUrlOptions = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
};

export function buildSpotifyAuthorizeUrl(options: AuthorizeUrlOptions) {
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    code_challenge_method: "S256",
    code_challenge: options.codeChallenge,
    scope: options.scope,
  });

  return assertOpenableUrl(`${SPOTIFY_AUTHORIZE_ENDPOINT}?${params.toString()}`);
}

/**
 * Accepts either the whole redirect URL copied from the browser or a bare authorization code,
 * and returns the validated code. Used by the manual sign-in fallback.
 */
export function extractAuthorizationCode(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste the redirect URL or the authorization code.");
  }

  let candidate = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;

    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(INVALID_CODE_MESSAGE);
    }

    if (parsed.searchParams.get("error")) {
      throw new Error("Spotify denied the authorization request. Please try again.");
    }

    const code = parsed.searchParams.get("code");
    if (!code) {
      throw new Error("That URL does not contain an authorization code.");
    }

    candidate = code.trim();
  }

  if (!AUTHORIZATION_CODE_PATTERN.test(candidate)) {
    throw new Error(INVALID_CODE_MESSAGE);
  }

  return candidate;
}
