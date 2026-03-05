import { Action, ActionPanel, Clipboard, Icon, LaunchProps, List, Toast, showToast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { fetchLyrics, resolveSongFromQuery } from "./lyrics-provider";
import { buildProgressKeys, getSavedProgress, setSavedProgress } from "./storage";
import { toKebabCase } from "./transform";
import { CopyMode, LyricsLine, SongSearchResult } from "./types";

type Arguments = {
  songName?: string;
};

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length - 1));
}

function findRestoredIndex(lines: LyricsLine[], savedIndex: number, savedLineText?: string) {
  if (savedLineText) {
    const matchedByText = lines.findIndex((line) => line.text === savedLineText);
    if (matchedByText >= 0) {
      return matchedByText;
    }
  }

  return clampIndex(savedIndex, lines.length);
}

function LyricsFromArgumentView({ query }: { query: string }) {
  const [song, setSong] = useState<SongSearchResult | null>(null);
  const [lines, setLines] = useState<LyricsLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!trimmedQuery) {
        setSong(null);
        setLines([]);
        setSelectedLineId(undefined);
        setErrorMessage("Provide a song name as the command argument.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const resolvedSong = await resolveSongFromQuery(trimmedQuery);
        const nextLines = await fetchLyrics(resolvedSong);
        const saved = await getSavedProgress(buildProgressKeys(resolvedSong, trimmedQuery));

        if (cancelled) {
          return;
        }

        setSong(resolvedSong);
        setLines(nextLines);
        setErrorMessage(null);

        if (nextLines.length === 0) {
          setSelectedLineId(undefined);
          return;
        }

        const targetIndex = saved ? findRestoredIndex(nextLines, saved.index, saved.lineText) : 0;
        setSelectedLineId(String(targetIndex));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSong(null);
        setLines([]);
        setSelectedLineId(undefined);
        setErrorMessage(error instanceof Error ? error.message : "Could not load lyrics.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [trimmedQuery]);

  async function copyLine(line: LyricsLine, mode: CopyMode) {
    if (!song) {
      await showToast({ style: Toast.Style.Failure, title: "Song not loaded" });
      return;
    }

    const content = mode === "kebab" ? toKebabCase(line.text) : line.text;
    if (!content) {
      await showToast({ style: Toast.Style.Failure, title: "Nothing to copy" });
      return;
    }

    await Clipboard.copy(content);
    await setSavedProgress(buildProgressKeys(song, trimmedQuery), { index: line.index, lineText: line.text });

    await showToast({
      style: Toast.Style.Success,
      title: mode === "original" ? "Copied line" : "Copied line (kebab-case)",
      message: `${song.title} - line ${line.index + 1}`,
    });
  }

  const navigationTitle = song ? `${song.title} - ${song.artist}` : "Trace Lyrics";
  const emptyTitle = errorMessage ? "Could not load lyrics" : "No lyrics found";
  const emptyDescription = errorMessage
    ? errorMessage
    : "No lyrics are available for this song in the selected provider.";

  return (
    <List
      filtering={false}
      isLoading={isLoading}
      selectedItemId={selectedLineId}
      onSelectionChange={(id) => setSelectedLineId(id ?? undefined)}
      navigationTitle={navigationTitle}
    >
      <List.EmptyView title={emptyTitle} description={emptyDescription} />
      {lines.map((line) => {
        const id = String(line.index);

        return (
          <List.Item
            key={id}
            id={id}
            title={line.text}
            accessories={[{ text: `#${line.index + 1}` }]}
            actions={
              <ActionPanel>
                <Action
                  title="Copy Line (Original)"
                  icon={Icon.Clipboard}
                  onAction={() => copyLine(line, "original")}
                />
                <Action
                  title="Copy Line (Kebab-Case)"
                  icon={Icon.TextCursor}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={() => copyLine(line, "kebab")}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const query = props.arguments.songName ?? "";
  return <LyricsFromArgumentView query={query} />;
}
