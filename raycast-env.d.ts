/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

type ExtensionPreferences = object;

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences;

declare namespace Preferences {
  /** Preferences accessible in the `trace-lyrics` command */
  export type TraceLyrics = ExtensionPreferences & {
    /** Default Copy Style - Select the copy format used by Enter in the lyrics list. */
    defaultCopyMode: "original" | "kebab";
    /** Translation Contact Email - Optional email passed to MyMemory to raise the free daily quota from 5,000 to 50,000 characters. */
    translationContactEmail?: string;
  };
}

declare namespace Arguments {
  /** Arguments passed to the `trace-lyrics` command */
  export type TraceLyrics = {
    /** Song name (optionally: song - artist) */
    songName: string;
  };
}
