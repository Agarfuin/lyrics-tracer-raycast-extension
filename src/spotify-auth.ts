import { createHash, randomBytes } from "node:crypto";
import { OAuth } from "@raycast/api";
import { buildSpotifyAuthorizeUrl, extractAuthorizationCode } from "./safety";

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type AccessTokenOptions = {
  forceRefresh?: boolean;
};

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// What OAuth.RedirectMethod.Web produces, and what has to be registered in the Spotify app.
export const SPOTIFY_REDIRECT_URI = "https://raycast.com/redirect?packageName=Extension";

// Search needs no scope, and playback runs through AppleScript rather than the Web API,
// so this deliberately requests no access to the account at all.
const SPOTIFY_SCOPE = "";

export const MISSING_CLIENT_ID_MESSAGE = "Add your Spotify Client ID in the command preferences.";
const SIGN_IN_FAILED_MESSAGE = "Could not connect to Spotify. Please try again.";
export const SESSION_EXPIRED_MESSAGE = "Your Spotify session expired. Please sign in again.";

const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Spotify",
  providerId: "spotify",
  description: "Connect your own Spotify app to search tracks. No client secret is stored.",
});

// Maps the standard OAuth error identifier to one of our own constant messages.
// Nothing from the response is ever echoed back to the user.
function toTokenErrorMessage(errorCode: string | undefined) {
  if (errorCode === "invalid_client") {
    return "Spotify rejected the Client ID. Check it in the command preferences.";
  }

  if (errorCode === "invalid_grant") {
    return "Spotify rejected the sign-in. Check that the redirect URI in your Spotify app matches exactly.";
  }

  return SIGN_IN_FAILED_MESSAGE;
}

async function requestTokens(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  let payload: SpotifyTokenResponse;

  try {
    payload = (await response.json()) as SpotifyTokenResponse;
  } catch {
    throw new Error(SIGN_IN_FAILED_MESSAGE);
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(toTokenErrorMessage(payload.error));
  }

  return payload;
}

async function authorize(clientId: string) {
  const request = await client.authorizationRequest({
    endpoint: SPOTIFY_AUTHORIZE_URL,
    clientId,
    scope: SPOTIFY_SCOPE,
  });

  const { authorizationCode } = await client.authorize(request);
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: request.redirectURI,
      client_id: clientId,
      code_verifier: request.codeVerifier,
    }),
  );

  await client.setTokens({
    accessToken: tokens.access_token as string,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });

  return tokens.access_token as string;
}

async function refresh(clientId: string, refreshToken: string) {
  let tokens: SpotifyTokenResponse;

  try {
    tokens = await requestTokens(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    );
  } catch {
    // Fail closed: drop the unusable token set so the next run asks for a fresh sign-in.
    await client.removeTokens();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  await client.setTokens({
    accessToken: tokens.access_token as string,
    // Spotify rotates refresh tokens; keep the previous one when none comes back.
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });

  return tokens.access_token as string;
}

export type ManualAuthorization = {
  url: string;
  codeVerifier: string;
};

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Fallback for when the browser cannot hand the redirect back to Raycast.
 *
 * The verifier is generated with a CSPRNG and only ever lives in memory, in the caller's
 * component state, for the duration of the sign-in.
 */
export function createManualAuthorization(clientId: string): ManualAuthorization {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error(MISSING_CLIENT_ID_MESSAGE);
  }

  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());

  return {
    url: buildSpotifyAuthorizeUrl({
      clientId: trimmedClientId,
      redirectUri: SPOTIFY_REDIRECT_URI,
      codeChallenge,
      scope: SPOTIFY_SCOPE,
    }),
    codeVerifier,
  };
}

export async function completeManualAuthorization(clientId: string, codeVerifier: string, pastedInput: string) {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error(MISSING_CLIENT_ID_MESSAGE);
  }

  const authorizationCode = extractAuthorizationCode(pastedInput);
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: trimmedClientId,
      code_verifier: codeVerifier,
    }),
  );

  // Stored through the same encrypted token store the deep-link flow uses, so refreshes
  // and sign-out behave identically afterwards.
  await client.setTokens({
    accessToken: tokens.access_token as string,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });
}

export async function isSpotifySignedIn() {
  const tokenSet = await client.getTokens();
  return Boolean(tokenSet?.accessToken);
}

export async function signOutOfSpotify() {
  await client.removeTokens();
}

export async function getSpotifyAccessToken(clientId: string, options: AccessTokenOptions = {}) {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error(MISSING_CLIENT_ID_MESSAGE);
  }

  const tokenSet = await client.getTokens();

  if (tokenSet?.accessToken) {
    if (!options.forceRefresh && !tokenSet.isExpired()) {
      return tokenSet.accessToken;
    }

    if (tokenSet.refreshToken) {
      return refresh(trimmedClientId, tokenSet.refreshToken);
    }

    await client.removeTokens();
  }

  return authorize(trimmedClientId);
}
