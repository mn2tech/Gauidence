import "server-only";

import { createHash } from "node:crypto";
import { EMBEDDING_MODEL } from "./embeddings";

export const EMBEDDING_CACHE_VERSION = "1";

const DEFAULT_MAX_SIZE = 256;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

type CacheEntry = {
  embedding: number[];
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export type EmbeddingCacheStats = {
  hits: number;
  misses: number;
};

const stats: EmbeddingCacheStats = { hits: 0, misses: 0 };

export function isEmbeddingCacheEnabled(): boolean {
  const raw = process.env.GUARDIAN_EMBEDDING_CACHE_ENABLED;
  if (raw === undefined) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function maxCacheSize(): number {
  const raw = process.env.GUARDIAN_EMBEDDING_CACHE_MAX_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_SIZE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SIZE;
}

function cacheTtlMs(): number {
  const raw = process.env.GUARDIAN_EMBEDDING_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_TTL_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

/** Normalize query text for stable hashing without storing raw questions as keys. */
export function normalizeQueryForEmbedding(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hashEmbeddingCacheKey(query: string): string {
  const normalized = normalizeQueryForEmbedding(query);
  const payload = `${EMBEDDING_MODEL}|${EMBEDDING_CACHE_VERSION}|${normalized}`;
  return createHash("sha256").update(payload).digest("hex");
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function evictOldest(): void {
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

export function getCachedEmbedding(key: string): number[] | null {
  if (!isEmbeddingCacheEnabled()) return null;
  evictExpired();
  const entry = cache.get(key);
  if (!entry) {
    stats.misses += 1;
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    stats.misses += 1;
    return null;
  }
  stats.hits += 1;
  return entry.embedding;
}

export function setCachedEmbedding(key: string, embedding: number[]): void {
  if (!isEmbeddingCacheEnabled()) return;
  evictExpired();
  while (cache.size >= maxCacheSize()) {
    evictOldest();
  }
  cache.set(key, {
    embedding,
    expiresAt: Date.now() + cacheTtlMs(),
  });
}

export function getEmbeddingCacheStats(): EmbeddingCacheStats {
  return { ...stats };
}

/** Reset cache and stats — for tests only. */
export function resetEmbeddingCacheForTests(): void {
  cache.clear();
  stats.hits = 0;
  stats.misses = 0;
}
