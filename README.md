# Lyrics Tracer (Raycast Extension)

Lyrics Tracer is a Raycast extension for copying song lyrics line by line, and for starting a song
straight from Raycast.

## Commands

### Trace Lyrics

- Takes a `songName` argument and loads lyrics for the best match.
- Lets you move through lyric lines with arrow keys.
- Copies the selected line with `Enter`.
- Supports two copy formats:
  - Original
  - kebab-case
- Can translate the selected line to English with `Cmd + Shift + E`
- Shows an English translation beside each line when the song's main language is not English.
- Remembers the last copied line for each song.
- Can hand the current song to `Play Song` with `Cmd + Shift + P`.

### Play Song

Search the Spotify catalog and start the track playing in the Spotify desktop app.

| Shortcut          | Action                                  |
| ----------------- | --------------------------------------- |
| `Enter`           | Play in Spotify                         |
| `Cmd + Shift + Y` | Open the song on YouTube Music          |
| `Cmd + L`         | Trace lyrics for the selected song      |
| `Cmd + Shift + O` | Open the song in the Spotify web player |
| `Cmd + Shift + X` | Sign out of Spotify                     |

The song name argument is optional: leave it empty and type in the search bar instead.

## Usage

1. Run `Trace Lyrics` in Raycast.
2. Enter a song name (you can also use `song - artist`).
3. Navigate lines with Up/Down.
4. Press `Enter` to copy the line as original text.
5. Use `Cmd + Shift + C` to copy the line in kebab-case.
6. Use `Cmd + Shift + E` to copy the line translated to English.

## English Translation Setup

English translation uses the MyMemory API.

1. Open Raycast Preferences for this extension.
2. Optionally add `Translation Contact Email`.

No API key is required. If you provide a contact email, MyMemory documents a higher free daily quota:
50,000 characters/day instead of the anonymous 5,000 characters/day limit.

### Inline translation

When a song's main language is not English, each line is shown with its English translation beside it.

- The language is detected from a sample of the longest lines, then cached per song.
- Only distinct lines are translated, so a repeated chorus costs one request rather than ten. A typical
  song works out at roughly 600 characters instead of 1,500.
- Translations are cached by line text, so reopening a song costs nothing.
- Lines that are already English are left without a translation, which keeps mixed-language songs readable.
- Turn it off with the **Inline Translation** preference if you would rather save the daily quota.

## Spotify Setup

Searching the Spotify catalog needs your own Spotify app. There is no keyless alternative: Spotify's
search endpoint requires an access token.

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Add this redirect URI to the app:

   ```
   https://raycast.com/redirect?packageName=Extension
   ```

   If the dashboard rejects the query string, register `https://raycast.com/redirect/extension` instead
   and add `extraParameters: { redirect_uri: "https://raycast.com/redirect/extension" }` to the
   `client.authorizationRequest(...)` call in `src/spotify-auth.ts`.

3. Copy the app's **Client ID** into the `Play Song` command preferences.
4. Run `Play Song` and choose **Sign in with Spotify** once.

**No client secret is needed or stored.** The extension uses the Authorization Code flow with PKCE, which
is designed for public clients, and Raycast keeps the resulting tokens in its own encrypted storage.

The authorization request asks for **no scopes at all**, because search needs none and playback is driven
locally through AppleScript rather than through the Web API.

If sign-in fails because the browser cannot hand the redirect back to Raycast, use **Sign in Manually**
(`Cmd + M`) instead: it opens the same consent page and you paste the resulting URL back into Raycast.

### Things to know

- **Spotify Premium is required.** Since Spotify's February 2026 changes, a Development Mode app requires
  its owner to have an active Premium subscription, and is limited to five allow-listed users.
- **Playback is macOS-only.** Starting playback uses AppleScript (`tell application "Spotify"`). Note that
  Spotify's `play track` command force-activates the app (a long-standing Spotify bug), so the Spotify
  window comes to the front when a song starts.
- **Windows degrades to a deeplink.** Spotify's `spotify:track:` deeplinks only navigate to a track without
  playing it, so the action is labelled "Open in Spotify" there and you press play yourself.
- **First playback asks for permission.** macOS will prompt to let Raycast control Spotify. If you decline,
  enable it later in System Settings > Privacy & Security > Automation.
- **YouTube Music needs no setup.** The action opens a YouTube Music search page for the track; it does not
  auto-play, because YouTube Music has no keyless search API.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
npm test
```

Tests run on Node's built-in runner (`node --test`) with no extra dependencies. They cover the
security-sensitive pure functions in `src/safety.ts` — the Spotify track ID allow-list, the AppleScript
command builder, and the URL allow-list used before anything is handed to the system opener — plus the
shared ranking heuristic in `src/match-ranking.ts`.

Test files import with an explicit `.ts` extension because Node's resolver requires it, and they are
excluded from `tsconfig.json` for the same reason.
