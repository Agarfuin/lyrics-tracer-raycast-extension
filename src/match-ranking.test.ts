import assert from "node:assert/strict";
import test from "node:test";
import { parseSongQuery, rankCandidates } from "./match-ranking.ts";

type Track = { title: string; artist: string };

const titles = (tracks: Track[]) => tracks.map((track) => track.title);

test("parseSongQuery splits the dash and 'by' forms", () => {
  assert.deepEqual(parseSongQuery("Bohemian Rhapsody - Queen"), {
    titleQuery: "Bohemian Rhapsody",
    artistQuery: "Queen",
  });
  assert.deepEqual(parseSongQuery("Bohemian Rhapsody by Queen"), {
    titleQuery: "Bohemian Rhapsody",
    artistQuery: "Queen",
  });
  assert.deepEqual(parseSongQuery("Bohemian Rhapsody"), { titleQuery: "Bohemian Rhapsody" });
});

test("rankCandidates puts the exact title above decorated variants", () => {
  const candidates: Track[] = [
    { title: "Bohemian Rhapsody - Live Aid", artist: "Queen" },
    { title: "Bohemian Rhapsody (Remastered 2011)", artist: "Queen" },
    { title: "Bohemian Rhapsody", artist: "Queen" },
  ];

  assert.equal(titles(rankCandidates(candidates, "Bohemian Rhapsody"))[0], "Bohemian Rhapsody");
});

test("rankCandidates demotes a sped up duplicate below the original", () => {
  const candidates: Track[] = [
    { title: "Blinding Lights - Sped Up", artist: "The Weeknd" },
    { title: "Blinding Lights", artist: "The Weeknd" },
  ];

  assert.deepEqual(titles(rankCandidates(candidates, "Blinding Lights - The Weeknd")), [
    "Blinding Lights",
    "Blinding Lights - Sped Up",
  ]);
});

test("rankCandidates uses the artist part of the query to break ties", () => {
  const candidates: Track[] = [
    { title: "Hurt", artist: "Nine Inch Nails" },
    { title: "Hurt", artist: "Johnny Cash" },
  ];

  assert.equal(rankCandidates(candidates, "Hurt - Johnny Cash")[0].artist, "Johnny Cash");
});

test("rankCandidates is stable, so provider relevance order survives ties", () => {
  const candidates: Track[] = [
    { title: "Same Song", artist: "Artist A" },
    { title: "Same Song", artist: "Artist B" },
    { title: "Same Song", artist: "Artist C" },
  ];

  assert.deepEqual(
    rankCandidates(candidates, "Same Song").map((track) => track.artist),
    ["Artist A", "Artist B", "Artist C"],
  );
});

test("rankCandidates handles diacritics and an empty candidate list", () => {
  const candidates: Track[] = [
    { title: "Simarik", artist: "Tarkan" },
    { title: "Şımarık", artist: "Tarkan" },
  ];

  assert.equal(rankCandidates(candidates, "Şımarık - Tarkan").length, 2);
  assert.deepEqual(rankCandidates([], "anything"), []);
});
