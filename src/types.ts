export type SongSearchResult = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
};

export type LyricsLine = {
  index: number;
  text: string;
};

export type CopyMode = "original" | "kebab";
