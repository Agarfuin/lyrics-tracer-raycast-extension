# Lyrics Tracer (Raycast Extension)

Lyrics Tracer is a Raycast extension for copying song lyrics line by line.

## What it does

- Takes a `songName` argument and loads lyrics for the best match.
- Lets you move through lyric lines with arrow keys.
- Copies the selected line with `Enter`.
- Supports two copy formats:
  - Original
  - kebab-case
- Can translate the selected line to English with `Cmd + Shift + E`
- Remembers the last copied line for each song.

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

No API key is required. If you provide a contact email, MyMemory documents a higher free daily quota: 50,000 characters/day instead of the anonymous 5,000 characters/day limit.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
```
