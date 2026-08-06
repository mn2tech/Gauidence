import "server-only";

const CACHE_TTL_MS = 60_000;

type CountCacheEntry = {
  counts: Record<string, number>;
  expiresAt: number;
};

const countCache = new Map<string, CountCacheEntry>();

function cacheKey(profileIds: string[]): string {
  return [...profileIds].sort().join(",");
}

export function getCachedProfileFileCounts(
  profileIds: string[]
): Record<string, number> | null {
  const key = cacheKey(profileIds);
  const entry = countCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) countCache.delete(key);
    return null;
  }
  return entry.counts;
}

export function setCachedProfileFileCounts(
  profileIds: string[],
  counts: Record<string, number>
): void {
  countCache.set(cacheKey(profileIds), {
    counts,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/** Reset cache — for tests only. */
export function resetProfileFileCountCacheForTests(): void {
  countCache.clear();
}
