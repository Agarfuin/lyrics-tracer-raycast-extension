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

export type TranslationProvider = "mymemory";

export type EnglishTranslation = {
  text: string;
  detectedSourceLanguage?: string;
  provider: TranslationProvider;
};

export type RankableTrack = {
  title: string;
  artist: string;
};

export type ParsedSongQuery = {
  titleQuery: string;
  artistQuery?: string;
};

export type SpotifyTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  explicit?: boolean;
  artworkUrl?: string;
};

export type SpotifyCredentials = {
  accessToken: string;
  refresh: () => Promise<string>;
};
