import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getCachedEmbedding,
  hashEmbeddingCacheKey,
  resetEmbeddingCacheForTests,
  setCachedEmbedding,
  getEmbeddingCacheStats,
  isEmbeddingCacheEnabled,
  normalizeQueryForEmbedding,
} from "../embeddingCache.ts";

describe("embeddingCache", () => {
  beforeEach(() => {
    resetEmbeddingCacheForTests();
  });

  it("stores and retrieves embeddings by hashed key", () => {
    const key = hashEmbeddingCacheKey("What is invoice INV-123?");
    const vec = [0.1, 0.2, 0.3];
    setCachedEmbedding(key, vec);
    assert.deepEqual(getCachedEmbedding(key), vec);
  });

  it("does not use raw question as cache key", () => {
    const key = hashEmbeddingCacheKey("secret question");
    assert.notEqual(key, "secret question");
    assert.match(key, /^[a-f0-9]{64}$/);
  });

  it("tracks cache hits and misses", () => {
    const key = hashEmbeddingCacheKey("test query");
    getCachedEmbedding(key);
    assert.equal(getEmbeddingCacheStats().misses, 1);
    setCachedEmbedding(key, [1]);
    getCachedEmbedding(key);
    assert.equal(getEmbeddingCacheStats().hits, 1);
  });

  it("normalizes whitespace and case for stable hashing", () => {
    const a = hashEmbeddingCacheKey("  Hello   World  ");
    const b = hashEmbeddingCacheKey("hello world");
    assert.equal(a, b);
  });

  it("normalizeQueryForEmbedding collapses whitespace", () => {
    assert.equal(
      normalizeQueryForEmbedding("  Foo\tBar  "),
      "foo bar"
    );
  });

  it("reports cache enabled by default", () => {
    assert.equal(isEmbeddingCacheEnabled(), true);
  });
});
