import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOpenableUrl,
  buildPlayTrackScript,
  buildSpotifyAuthorizeUrl,
  buildSpotifyDashboardUrl,
  buildSpotifyTrackUrl,
  buildYouTubeMusicSearchUrl,
  extractAuthorizationCode,
  isSpotifyTrackId,
  toSafeArtworkUrl,
} from "./safety.ts";

const VALID_TRACK_ID = "4cOdK2wGLETKBW3PvgPWqT";

const INJECTION_IDS = [
  'a"; do shell script "id',
  '4cOdK2wGLETKBW3Pvg"qT',
  '"\nend tell\ntell application "Finder"\nempty trash\nend tell\ntell application "Spotify"\n',
  "4cOdK2wGLETKBW3PvgPW\\t",
  "$(id)",
  "`id`",
  "; rm -rf ~",
  "4cOdK2wGLETKBW3PvgPW\nT",
];

test("isSpotifyTrackId accepts exactly 22 alphanumeric characters", () => {
  assert.equal(isSpotifyTrackId(VALID_TRACK_ID), true);
  assert.equal(isSpotifyTrackId("a".repeat(22)), true);
  assert.equal(isSpotifyTrackId("0123456789012345678901"), true);
});

test("isSpotifyTrackId rejects injection payloads", () => {
  for (const injection of INJECTION_IDS) {
    assert.equal(isSpotifyTrackId(injection), false, `must reject ${JSON.stringify(injection)}`);
  }
});

test("isSpotifyTrackId rejects wrong lengths, separators and empty input", () => {
  assert.equal(isSpotifyTrackId(""), false);
  assert.equal(isSpotifyTrackId("a".repeat(21)), false);
  assert.equal(isSpotifyTrackId("a".repeat(23)), false);
  assert.equal(isSpotifyTrackId("4cOdK2wGLETKBW3PvgPW-T"), false);
  assert.equal(isSpotifyTrackId("4cOdK2wGLETKBW3PvgPW_T"), false);
  assert.equal(isSpotifyTrackId("4cOdK2wGLETKBW3PvgPW T"), false);
  assert.equal(isSpotifyTrackId("../../../etc/passwdAAA"), false);
});

test("buildPlayTrackScript emits the expected script for a valid id", () => {
  assert.equal(
    buildPlayTrackScript(VALID_TRACK_ID),
    'tell application "Spotify"\n\tplay track "spotify:track:4cOdK2wGLETKBW3PvgPWqT"\nend tell',
  );
});

test("buildPlayTrackScript refuses to build a script from an untrusted id", () => {
  for (const injection of [...INJECTION_IDS, ""]) {
    assert.throws(
      () => buildPlayTrackScript(injection),
      /cannot be played/,
      `must refuse ${JSON.stringify(injection)}`,
    );
  }
});

test("a built script keeps exactly its own fixed structure", () => {
  const lines = buildPlayTrackScript(VALID_TRACK_ID).split("\n");

  // Three lines, and the only quotes are the two pairs this module itself writes:
  // one around the application name and one around the track URI.
  assert.equal(lines.length, 3, "script must stay exactly three lines");
  assert.equal(lines[1].match(/"/g)?.length, 2, "the track line must hold exactly one quoted literal");
  assert.equal(lines[1].includes("do shell script"), false);
});

test("an injected id can never reach the script body", () => {
  for (const injection of INJECTION_IDS) {
    let script: string | null = null;

    try {
      script = buildPlayTrackScript(injection);
    } catch {
      script = null;
    }

    assert.equal(script, null, `${JSON.stringify(injection)} must never produce a script`);
  }
});

test("assertOpenableUrl accepts only the allow-listed hosts over https", () => {
  assert.equal(
    assertOpenableUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  );
  assert.match(assertOpenableUrl("https://music.youtube.com/search?q=a%20b"), /^https:\/\/music\.youtube\.com\/search/);
});

test("buildSpotifyDashboardUrl returns the allow-listed dashboard URL", () => {
  assert.equal(buildSpotifyDashboardUrl(), "https://developer.spotify.com/dashboard");
});

test("assertOpenableUrl rejects lookalike hosts, bad schemes and userinfo tricks", () => {
  const rejected = [
    "http://music.youtube.com/search",
    "http://developer.spotify.com/dashboard",
    "https://developer.spotify.com.evil.com/dashboard",
    "https://developer-spotify.com/dashboard",
    "http://open.spotify.com/track/x",
    "https://music.youtube.com.evil.com/search",
    "https://evil.com/music.youtube.com",
    "https://evil-music.youtube.com/search",
    "https://music.youtube.com@evil.com",
    "https://open.spotify.com.evil.com/track/x",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
    "//music.youtube.com/search",
    "not a url",
    "",
  ];

  for (const url of rejected) {
    assert.throws(() => assertOpenableUrl(url), /cannot be opened/, `must reject ${JSON.stringify(url)}`);
  }
});

test("buildSpotifyTrackUrl validates the id before building a URL", () => {
  assert.equal(buildSpotifyTrackUrl(VALID_TRACK_ID), `https://open.spotify.com/track/${VALID_TRACK_ID}`);
  assert.throws(() => buildSpotifyTrackUrl("../../evil"), /cannot be played/);
  assert.throws(() => buildSpotifyTrackUrl("a".repeat(23)), /cannot be played/);
});

test("buildYouTubeMusicSearchUrl encodes the query so it cannot alter the query string", () => {
  const url = new URL(buildYouTubeMusicSearchUrl("a&b=c?d#e /../ &key=leaked"));

  assert.equal(url.hostname, "music.youtube.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "a&b=c?d#e /../ &key=leaked");
  assert.equal([...url.searchParams.keys()].length, 1, "no extra parameter may be injected");
  assert.equal(url.hash, "", "the fragment must not escape the encoded value");
});

test("buildYouTubeMusicSearchUrl preserves non-ASCII and rejects empty input", () => {
  const url = new URL(buildYouTubeMusicSearchUrl("Tarkan Şımarık"));

  assert.equal(url.searchParams.get("q"), "Tarkan Şımarık");
  assert.throws(() => buildYouTubeMusicSearchUrl("   "), /provide a song name/);
});

test("toSafeArtworkUrl allows Spotify image hosts and drops everything else", () => {
  assert.equal(toSafeArtworkUrl("https://i.scdn.co/image/abc"), "https://i.scdn.co/image/abc");
  assert.equal(toSafeArtworkUrl(undefined), undefined);
  assert.equal(toSafeArtworkUrl("http://i.scdn.co/image/abc"), undefined);
  assert.equal(toSafeArtworkUrl("https://i.scdn.co.evil.com/image/abc"), undefined);
  assert.equal(toSafeArtworkUrl("javascript:alert(1)"), undefined);
});

const REAL_CODE = "AQASN50zvsbGSynPc1wc6mGYVy1XNb05DdxDWUdq";

test("extractAuthorizationCode reads the code out of a pasted redirect URL", () => {
  assert.equal(
    extractAuthorizationCode(`https://raycast.com/redirect?packageName=Extension&code=${REAL_CODE}`),
    REAL_CODE,
  );
  assert.equal(extractAuthorizationCode(`  https://www.raycast.com/redirect?code=${REAL_CODE}&state=x  `), REAL_CODE);
});

test("extractAuthorizationCode accepts a bare code", () => {
  assert.equal(extractAuthorizationCode(REAL_CODE), REAL_CODE);
  assert.equal(extractAuthorizationCode(`  ${REAL_CODE}  `), REAL_CODE);
});

test("extractAuthorizationCode surfaces a denied authorization", () => {
  assert.throws(
    () => extractAuthorizationCode("https://raycast.com/redirect?error=access_denied"),
    /denied the authorization/,
  );
});

test("extractAuthorizationCode rejects junk, empty and injection-shaped input", () => {
  const rejected = [
    "",
    "   ",
    "https://raycast.com/redirect?packageName=Extension",
    "short",
    `${REAL_CODE} ; rm -rf ~`,
    `${REAL_CODE}"`,
    `${REAL_CODE}\n${REAL_CODE}`,
    "a".repeat(513),
    "not a url at all !!!",
  ];

  for (const input of rejected) {
    assert.throws(() => extractAuthorizationCode(input), `must reject ${JSON.stringify(input)}`);
  }
});

test("buildSpotifyAuthorizeUrl encodes parameters and stays on the allow-listed host", () => {
  const url = new URL(
    buildSpotifyAuthorizeUrl({
      clientId: "abc123",
      redirectUri: "https://raycast.com/redirect?packageName=Extension",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      scope: "",
    }),
  );

  assert.equal(url.hostname, "accounts.spotify.com");
  assert.equal(url.pathname, "/authorize");
  assert.equal(url.searchParams.get("redirect_uri"), "https://raycast.com/redirect?packageName=Extension");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("response_type"), "code");
});
