import assert from "node:assert/strict";
import test from "node:test";
import { buildTextCacheKey } from "./cache-key.ts";

test("distinct lines in a non-Latin script get distinct keys", () => {
  const lines = [
    "いつか あのドームいっぱいの",
    "私たちは星の子",
    "輝くために 生まれてきたのさ",
    "君が望んでくれた",
    "交差してゆくスポットライト",
    "우리는 별의 아이",
    "Мы дети звёзд",
    "Είμαστε παιδιά των άστρων",
  ];

  const keys = lines.map(buildTextCacheKey);
  assert.equal(new Set(keys).size, lines.length, "every line must hash to its own key");
  assert.ok(
    keys.every((key) => key.length > 0),
    "no line may produce an empty key",
  );
});

test("the same text always produces the same key", () => {
  assert.equal(buildTextCacheKey("私たちは星の子"), buildTextCacheKey("私たちは星の子"));
  assert.equal(buildTextCacheKey("  私たちは星の子  "), buildTextCacheKey("私たちは星の子"));
});

test("keys are storage-safe and fixed length", () => {
  for (const text of ["私たちは星の子", "a/b+c=d", "line with spaces", "🎵 emoji line"]) {
    const key = buildTextCacheKey(text);
    assert.match(key, /^[A-Za-z0-9_-]{32}$/, `unsafe key for ${text}`);
  }
});

test("different text produces different keys, including near-identical lines", () => {
  assert.notEqual(buildTextCacheKey("私たちは星の子"), buildTextCacheKey("私たちは星の子。"));
  assert.notEqual(buildTextCacheKey(""), buildTextCacheKey(" a "));
  assert.notEqual(buildTextCacheKey("Numb"), buildTextCacheKey("numb"));
});
