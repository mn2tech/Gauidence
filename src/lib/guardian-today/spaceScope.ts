import { rankPriorities } from "./scoring";
import type { ScoredWatchItem } from "./types";

export const TODAY_GROUP_LIMIT = 3;
export const TODAY_SCOPE_LIMIT = 5;

export type SpaceScopeProfile = {
  id: string;
  display_name: string;
  profile_type: string;
  parent_profile_id: string | null;
};

export function spaceScopeMap(
  profiles: SpaceScopeProfile[]
): Map<string, SpaceScopeProfile> {
  return new Map(profiles.map((p) => [p.id, p]));
}

/** Walk parents until a top-level space (no accessible parent). */
export function rootSpaceId(
  spaceId: string,
  byId: Map<string, SpaceScopeProfile>
): string {
  let current = spaceId;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(current)) return current;
    seen.add(current);
    const profile = byId.get(current);
    if (!profile?.parent_profile_id) return current;
    if (!byId.has(profile.parent_profile_id)) return current;
    current = profile.parent_profile_id;
  }
}

/** Selected space plus nested spaces the user can access. */
export function spaceIdsUnderRoot(
  rootId: string,
  byId: Map<string, SpaceScopeProfile>
): string[] {
  if (!byId.has(rootId)) return [];
  const ids: string[] = [];
  for (const id of byId.keys()) {
    if (rootSpaceId(id, byId) === rootId) ids.push(id);
  }
  return ids;
}

export function restrictToAuthorized(
  requested: string[],
  authorized: string[]
): string[] {
  const allowed = new Set(authorized);
  return requested.filter((id) => allowed.has(id));
}

export type ScoredSpaceGroup = {
  rootId: string;
  profile: SpaceScopeProfile | null;
  items: ScoredWatchItem[];
};

/**
 * Keep Personal, Business, and other top-level Spaces from competing
 * for a single combined top-N. Rank within each root Space instead.
 */
export function groupScoredByRootSpace(
  scored: ScoredWatchItem[],
  byId: Map<string, SpaceScopeProfile>,
  limitPerGroup = TODAY_GROUP_LIMIT
): ScoredSpaceGroup[] {
  const buckets = new Map<string, ScoredWatchItem[]>();
  for (const item of scored) {
    const rootId = byId.has(item.space_id)
      ? rootSpaceId(item.space_id, byId)
      : item.space_id;
    const list = buckets.get(rootId) ?? [];
    list.push(item);
    buckets.set(rootId, list);
  }

  const groups: ScoredSpaceGroup[] = [];
  for (const [rootId, items] of buckets) {
    groups.push({
      rootId,
      profile: byId.get(rootId) ?? null,
      items: rankPriorities(items, limitPerGroup),
    });
  }

  groups.sort((a, b) => {
    const scoreA = a.items[0]?.score ?? 0;
    const scoreB = b.items[0]?.score ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const nameA = a.profile?.display_name ?? a.items[0]?.space_name ?? "";
    const nameB = b.profile?.display_name ?? b.items[0]?.space_name ?? "";
    return nameA.localeCompare(nameB);
  });

  return groups.filter((g) => g.items.length > 0);
}
