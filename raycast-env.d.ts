/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `trace-lyrics` command */
  export type TraceLyrics = ExtensionPreferences & {
  /** Default Copy Style - Select the copy format used by Enter in the lyrics list. */
  "defaultCopyMode": "original" | "kebab",
  /** Inline Translation - Detects the song's main language and shows an English translation beside each line. Uses the MyMemory daily quota. */
  "showInlineTranslation": boolean,
  /** Translation Contact Email - Optional email passed to MyMemory to raise the free daily quota from 5,000 to 50,000 characters. */
  "translationContactEmail"?: string
}
  /** Preferences accessible in the `play-song` command */
  export type PlaySong = ExtensionPreferences & {
  /** Spotify Client ID - Client ID of your own Spotify app. Register the redirect URI https://raycast.com/redirect?packageName=Extension. No client secret is needed or stored. */
  "spotifyClientId"?: string,
  /** Window Behavior - Closes the Raycast window and shows a HUD once playback starts. */
  "closeAfterPlay": boolean
}
}

declare namespace Arguments {
  /** Arguments passed to the `trace-lyrics` command */
  export type TraceLyrics = {
  /** Song name (optionally: song - artist) */
  "songName": string
}
  /** Arguments passed to the `play-song` command */
  export type PlaySong = {
  /** Song name (optionally: song - artist) */
  "songName": string
}
}

