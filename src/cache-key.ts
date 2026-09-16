import { createHash } from "node:crypto";

const CACHE_KEY_LENGTH = 32;

/**
 * Builds a storage key from arbitrary lyric text.
 *
 * Hashing rather than slugifying is deliberate: a slug that keeps only [a-z0-9] collapses every
 * Japanese, Korean, Greek or Cyrillic line to the same empty string, so unrelated lines would
 * share one cache entry and show each other's translation.
 */
export function buildTextCacheKey(text: string) {
  const normalized = text.trim().normalize("NFC");
  return createHash("sha256").update(normalized, "utf8").digest("base64url").slice(0, CACHE_KEY_LENGTH);
}
