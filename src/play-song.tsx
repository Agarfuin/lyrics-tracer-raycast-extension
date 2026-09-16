import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Icon,
  LaunchProps,
  LaunchType,
  List,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  launchCommand,
  openCommandPreferences,
  showHUD,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ManualSignInForm } from "./spotify-manual-sign-in";
import { openSpotifyDashboard, openSpotifyTrackInBrowser, openYouTubeMusicSearch, playSpotifyTrack } from "./playback";
import {
  MISSING_CLIENT_ID_MESSAGE,
  SPOTIFY_REDIRECT_URI,
  getSpotifyAccessToken,
  isSpotifySignedIn,
  signOutOfSpotify,
} from "./spotify-auth";
import { isApplescriptSupported } from "./spotify-applescript";
import { searchSpotifyTracks } from "./spotify-provider";
import { SpotifyCredentials, SpotifyTrack } from "./types";

type Arguments = {
  songName?: string;
};

type Preferences = {
  spotifyClientId?: string;
  closeAfterPlay?: boolean;
};

function formatDuration(durationMs: number | undefined) {
  if (typeof durationMs !== "number" || durationMs <= 0) {
    return undefined;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toSearchQuery(track: SpotifyTrack) {
  return `${track.title} - ${track.artist}`;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function PlaySongView({ initialQuery }: Readonly<{ initialQuery: string }>) {
  const preferences = getPreferenceValues<Preferences>();
  const { push } = useNavigation();
  const [searchText, setSearchText] = useState(initialQuery);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // Bumped after sign-in and sign-out so the search effect re-runs for the unchanged query.
  const [reloadToken, setReloadToken] = useState(0);

  const trimmedQuery = useMemo(() => searchText.trim(), [searchText]);
  const clientId = useMemo(() => preferences.spotifyClientId?.trim() ?? "", [preferences.spotifyClientId]);
  const canPlayInApp = isApplescriptSupported();

  const buildCredentials = useCallback(async (): Promise<SpotifyCredentials> => {
    return {
      accessToken: await getSpotifyAccessToken(clientId),
      refresh: () => getSpotifyAccessToken(clientId, { forceRefresh: true }),
    };
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clientId) {
        setNeedsSignIn(false);
        setTracks([]);
        setErrorMessage(MISSING_CLIENT_ID_MESSAGE);
        setIsLoading(false);
        return;
      }

      // Resolved before anything is typed, so the sign-in action exists on an empty search bar.
      // Reading the stored token never opens the overlay; only the explicit action does.
      const signedIn = await isSpotifySignedIn();
      if (cancelled) {
        return;
      }

      setNeedsSignIn(!signedIn);

      if (!signedIn || !trimmedQuery) {
        setTracks([]);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchSpotifyTracks(trimmedQuery, await buildCredentials());

        if (cancelled) {
          return;
        }

        setNeedsSignIn(false);
        setTracks(results);
        setErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setTracks([]);
        setErrorMessage(toErrorMessage(error, "Could not search Spotify."));
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
  }, [trimmedQuery, clientId, reloadToken, buildCredentials]);

  async function openDashboard() {
    try {
      await openSpotifyDashboard();
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Could not open the Spotify dashboard" });
    }
  }

  async function copyRedirectUri() {
    await Clipboard.copy(SPOTIFY_REDIRECT_URI);
    await showToast({ style: Toast.Style.Success, title: "Copied redirect URI" });
  }

  async function signIn() {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Connecting to Spotify..." });

    try {
      await getSpotifyAccessToken(clientId);
      setNeedsSignIn(false);
      setReloadToken((token) => token + 1);
      toast.style = Toast.Style.Success;
      toast.title = "Connected to Spotify";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not connect to Spotify";
      toast.message = toErrorMessage(error, "Unknown sign-in error");
    }
  }

  function signInManually() {
    push(
      <ManualSignInForm
        clientId={clientId}
        onSignedIn={() => {
          setNeedsSignIn(false);
          setReloadToken((token) => token + 1);
        }}
      />,
    );
  }

  async function signOut() {
    await signOutOfSpotify();
    setNeedsSignIn(true);
    setTracks([]);
    setReloadToken((token) => token + 1);
    await showToast({ style: Toast.Style.Success, title: "Signed out of Spotify" });
  }

  async function play(track: SpotifyTrack) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting playback..." });

    try {
      const outcome = await playSpotifyTrack(track.id);

      toast.style = Toast.Style.Success;
      toast.title = outcome === "playing" ? "Playing in Spotify" : "Opened in Spotify";
      toast.message = toSearchQuery(track);

      if (preferences.closeAfterPlay !== false) {
        await closeMainWindow();
        await showHUD(`${outcome === "playing" ? "Playing" : "Opened"}: ${toSearchQuery(track)}`);
      }
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not play this song";
      toast.message = toErrorMessage(error, "Unknown playback error");
    }
  }

  async function playInYouTubeMusic(query: string) {
    try {
      await openYouTubeMusicSearch(query);

      if (preferences.closeAfterPlay !== false) {
        await closeMainWindow();
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open YouTube Music",
        message: toErrorMessage(error, "Unknown error"),
      });
    }
  }

  async function openInBrowser(track: SpotifyTrack) {
    try {
      await openSpotifyTrackInBrowser(track.id);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not open Spotify",
        message: toErrorMessage(error, "Unknown error"),
      });
    }
  }

  async function traceLyrics(track: SpotifyTrack) {
    try {
      await launchCommand({
        name: "trace-lyrics",
        type: LaunchType.UserInitiated,
        arguments: { songName: toSearchQuery(track) },
      });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Could not open Trace Lyrics" });
    }
  }

  function emptyView() {
    if (!clientId) {
      return (
        <List.EmptyView
          icon={Icon.Key}
          title="Spotify Client ID required"
          description={`Create a Spotify app, register the redirect URI ${SPOTIFY_REDIRECT_URI}, then paste its Client ID here. No client secret is needed.`}
          actions={
            <ActionPanel>
              <Action title="Open Command Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
              <Action
                title="Open Spotify Developer Dashboard"
                icon={Icon.Globe}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                onAction={openDashboard}
              />
              <Action
                title="Copy Redirect Uri"
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={copyRedirectUri}
              />
              {trimmedQuery ? (
                <Action
                  title="Search on Youtube Music"
                  icon={Icon.Headphones}
                  onAction={() => playInYouTubeMusic(trimmedQuery)}
                />
              ) : null}
            </ActionPanel>
          }
        />
      );
    }

    if (needsSignIn) {
      return (
        <List.EmptyView
          icon={Icon.Person}
          title="Connect your Spotify account"
          description="Sign in once so the extension can search the Spotify catalog."
          actions={
            <ActionPanel>
              <Action title="Sign in with Spotify" icon={Icon.Person} onAction={signIn} />
              <Action
                title="Sign in Manually (Paste Code)"
                icon={Icon.Key}
                shortcut={{ modifiers: ["cmd"], key: "m" }}
                onAction={signInManually}
              />
              <Action title="Open Command Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
            </ActionPanel>
          }
        />
      );
    }

    return (
      <List.EmptyView
        icon={errorMessage ? Icon.Warning : Icon.MagnifyingGlass}
        title={errorMessage ? "Could not search Spotify" : trimmedQuery ? "No songs found" : "Search for a song"}
        description={
          errorMessage ??
          (trimmedQuery ? "Try adding the artist name, e.g. song - artist." : "Type a song name to start playing.")
        }
        actions={
          trimmedQuery ? (
            <ActionPanel>
              <Action
                title="Search on Youtube Music"
                icon={Icon.Headphones}
                onAction={() => playInYouTubeMusic(trimmedQuery)}
              />
            </ActionPanel>
          ) : null
        }
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      throttle
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Song name (optionally: song - artist)"
    >
      {emptyView()}
      {tracks.map((track) => {
        const duration = formatDuration(track.durationMs);
        const accessories: List.Item.Accessory[] = [];

        if (track.explicit) {
          accessories.push({ text: { value: "E", color: Color.SecondaryText }, tooltip: "Explicit" });
        }

        if (duration) {
          accessories.push({ text: { value: duration, color: Color.SecondaryText } });
        }

        return (
          <List.Item
            key={track.id}
            id={track.id}
            title={track.title}
            subtitle={track.album ? `${track.artist} - ${track.album}` : track.artist}
            icon={track.artworkUrl ? { source: track.artworkUrl } : Icon.Music}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action
                  title={canPlayInApp ? "Play in Spotify" : "Open in Spotify"}
                  icon={Icon.Play}
                  onAction={() => play(track)}
                />
                <Action
                  title="Play in Youtube Music"
                  icon={Icon.Headphones}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "y" }}
                  onAction={() => playInYouTubeMusic(toSearchQuery(track))}
                />
                <Action
                  title="Trace Lyrics for This Song"
                  icon={Icon.Text}
                  shortcut={{ modifiers: ["cmd"], key: "l" }}
                  onAction={() => traceLyrics(track)}
                />
                <Action
                  title="Open in Spotify Web Player"
                  icon={Icon.Globe}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={() => openInBrowser(track)}
                />
                <Action
                  title="Sign out of Spotify"
                  icon={Icon.Logout}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
                  onAction={signOut}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function Command(props: Readonly<LaunchProps<{ arguments: Arguments }>>) {
  return <PlaySongView initialQuery={props.arguments.songName ?? ""} />;
}
