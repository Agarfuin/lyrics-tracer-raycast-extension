import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildPlayTrackScript } from "./safety";

const execFileAsync = promisify(execFile);

const OSASCRIPT_PATH = "/usr/bin/osascript";
const OSASCRIPT_TIMEOUT_MS = 8_000;
const OSASCRIPT_MAX_BUFFER = 64 * 1024;
const AUTOMATION_DENIED_CODE = "-1743";

const AUTOMATION_DENIED_MESSAGE =
  "Raycast is not allowed to control Spotify. Enable it in System Settings > Privacy & Security > Automation.";
const PLAYBACK_FAILED_MESSAGE = "Could not start playback in Spotify.";

function toPlaybackError(error: unknown) {
  const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";

  if (stderr.includes(AUTOMATION_DENIED_CODE)) {
    return new Error(AUTOMATION_DENIED_MESSAGE);
  }

  // Never surface raw stderr or the failing command line to the user.
  return new Error(PLAYBACK_FAILED_MESSAGE);
}

export function isApplescriptSupported() {
  return process.platform === "darwin";
}

export async function playTrackWithAppleScript(trackId: string) {
  // Throws before anything is spawned when the id is not allow-listed.
  const script = buildPlayTrackScript(trackId);

  try {
    // execFile with an absolute path and an argv array: no shell and no PATH lookup,
    // so no shell metacharacter can be interpreted.
    await execFileAsync(OSASCRIPT_PATH, ["-e", script], {
      timeout: OSASCRIPT_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: OSASCRIPT_MAX_BUFFER,
      windowsHide: true,
    });
  } catch (error) {
    throw toPlaybackError(error);
  }
}
