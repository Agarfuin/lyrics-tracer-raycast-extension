import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  closeMainWindow,
  getPreferenceValues,
  Icon,
  LaunchProps,
  List,
  Toast,
  showToast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { fetchLyrics, resolveSongFromQuery } from "./lyrics-provider";
import { buildProgressKeys, getSavedProgress, setSavedProgress } from "./storage";
import { toKebabCase } from "./transform";
import { CopyMode, LyricsLine, SongSearchResult } from "./types";

type Arguments = {
  songName?: string;
};

type Preferences = {
  defaultCopyMode?: CopyMode;
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

function normalizeCopyMode(mode: string | undefined): CopyMode {
  return mode === "kebab" ? "kebab" : "original";
}

function copyModeLabel(mode: CopyMode) {
  return mode === "kebab" ? "Kebab-Case" : "Original";
}

function LyricsFromArgumentView({ query, defaultCopyMode }: { query: string; defaultCopyMode: CopyMode }) {
  const [song, setSong] = useState<SongSearchResult | null>(null);
  const [lines, setLines] = useState<LyricsLine[]>([]);
  const [lastSavedLineId, setLastSavedLineId] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!trimmedQuery) {
        setSong(null);
        setLines([]);
        setLastSavedLineId(undefined);
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
          setLastSavedLineId(undefined);
          return;
        }

        if (saved) {
          const targetIndex = findRestoredIndex(nextLines, saved.index, saved.lineText);
          setLastSavedLineId(String(targetIndex));
        } else {
          setLastSavedLineId(undefined);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSong(null);
        setLines([]);
        setLastSavedLineId(undefined);
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

  async function copyLine(line: LyricsLine, mode: CopyMode, closeAfterCopy = false) {
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
    setLastSavedLineId(String(line.index));

    await showToast({
      style: Toast.Style.Success,
      title: mode === "original" ? "Copied line" : "Copied line (kebab-case)",
      message: `${song.title} - line ${line.index + 1}`,
    });

    if (closeAfterCopy) {
      await closeMainWindow();
    }
  }

  const navigationTitle = song ? `${song.title} - ${song.artist}` : "Trace Lyrics";
  const emptyTitle = errorMessage ? "Could not load lyrics" : "No lyrics found";
  const emptyDescription = errorMessage
    ? errorMessage
    : "No lyrics are available for this song in the selected provider.";
  const alternativeCopyMode: CopyMode = defaultCopyMode === "original" ? "kebab" : "original";

  return (
    <List
      filtering={false}
      isLoading={isLoading}
      navigationTitle={navigationTitle}
      selectedItemId={selectedId}
      onSelectionChange={(id) => setSelectedId(id ?? undefined)}
    >
      <List.EmptyView title={emptyTitle} description={emptyDescription} />
      {lines.map((line) => {
        const id = String(line.index);
        const isLastCopiedLine = lastSavedLineId === id;
        const isSelected = selectedId === id;
        const accessories: List.Item.Accessory[] = [
          {
            text: {
              value: `#${line.index + 1}`,
              color: isSelected ? Color.Magenta : Color.SecondaryText,
            },
          },
        ];

        if (isLastCopiedLine) {
          accessories.unshift({ text: { value: "Last Copied", color: Color.Green } });
        }

        return (
          <List.Item
            key={id}
            id={id}
            title={line.text}
            icon={isLastCopiedLine ? { source: Icon.ArrowRight, tintColor: Color.Green } : undefined}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action
                  title={`Copy Line (${copyModeLabel(defaultCopyMode)})`}
                  icon={Icon.Clipboard}
                  onAction={() => copyLine(line, defaultCopyMode, true)}
                />
                <Action
                  title={`Copy Line (${copyModeLabel(alternativeCopyMode)})`}
                  icon={Icon.TextCursor}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={() => copyLine(line, alternativeCopyMode)}
                />
                <Action
                  title="Jump to Last Line"
                  icon={Icon.ArrowDown}
                  shortcut={{ modifiers: [], key: "d" }}
                  onAction={() => setSelectedId(String(lines.length - 1))}
                />
                <Action
                  title="Jump to First Line"
                  icon={Icon.ArrowUp}
                  shortcut={{ modifiers: [], key: "u" }}
                  onAction={() => setSelectedId("0")}
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
  const preferences = getPreferenceValues<Preferences>();
  const defaultCopyMode = normalizeCopyMode(preferences.defaultCopyMode);
  return <LyricsFromArgumentView query={query} defaultCopyMode={defaultCopyMode} />;
}
