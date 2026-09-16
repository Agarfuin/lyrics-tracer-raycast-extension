import assert from "node:assert/strict";
import test from "node:test";
import { decideMainLanguage, pickDetectionSamples } from "./song-language.ts";

test("pickDetectionSamples prefers the longest distinct lines", () => {
  const lines = ["short", "a much longer line here", "short", "another fairly long line", "tiny"];
  const samples = pickDetectionSamples(lines, 2);

  assert.deepEqual(samples, ["another fairly long line", "a much longer line here"]);
});

test("pickDetectionSamples deduplicates and ignores blank lines", () => {
  const lines = ["Kaderim puskullu belam", "  ", "Kaderim puskullu belam", "Seni gidi findikkiran"];
  assert.equal(pickDetectionSamples(lines).length, 2);
});

test("pickDetectionSamples falls back to short lines when nothing is long", () => {
  assert.deepEqual(pickDetectionSamples(["oh", "ah"]), ["oh", "ah"]);
  assert.deepEqual(pickDetectionSamples([]), []);
});

test("a clearly Turkish song is not English", () => {
  const result = decideMainLanguage([{ language: "tr" }, { language: "tr" }, { language: "tr" }, { english: true }]);

  assert.deepEqual(result, { isEnglish: false, language: "tr" });
});

test("an English song with a few foreign lines stays English", () => {
  const result = decideMainLanguage([{ english: true }, { english: true }, { english: true }, { language: "fr" }]);

  assert.equal(result.isEnglish, true);
});

test("a tie counts as English, so translation is not forced on ambiguous songs", () => {
  assert.equal(decideMainLanguage([{ english: true }, { language: "de" }]).isEnglish, true);
});

test("an English detection reported as a language code still counts as English", () => {
  assert.equal(decideMainLanguage([{ language: "en-GB" }, { language: "EN" }, { language: "tr" }]).isEnglish, true);
});

test("unknown and empty samples never trigger translation on their own", () => {
  assert.equal(decideMainLanguage([{ unknown: true }, { unknown: true }]).isEnglish, true);
  assert.equal(decideMainLanguage([]).isEnglish, true);
  assert.equal(decideMainLanguage([{ language: "   " }]).isEnglish, true);
});

test("the most common non-English language wins", () => {
  const result = decideMainLanguage([{ language: "tr" }, { language: "de" }, { language: "tr" }]);
  assert.deepEqual(result, { isEnglish: false, language: "tr" });
});
