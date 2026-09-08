/**
 * Pure helpers for My World cards (unit-testable, no Supabase).
 */

import type {
  SpaceActivityRow,
  SpaceCountRow,
  SpaceItemRow,
  WorldCard,
  WorldCardInput,
  WorldSpaceStats,
} from "./types";

export function emptyWorldStats(): WorldSpaceStats {
  return {
    itemCount: 0,
    openActionCount: 0,
    upcomingDeadlineCount: 0,
    documentCount: 0,
    logCount: 0,
    linkedPeopleCount: 0,
    recentActivityTitle: null,
    recentActivityAt: null,
    lastUpdatedAt: null,
  };
}

/** Count map → number for a set of space ids (parent + nested). */
export function sumCountsForSpaces(
  counts: Map<string, number>,
  spaceIds: string[]
): number {
  let n = 0;
  for (const id of spaceIds) n += counts.get(id) ?? 0;
  return n;
}

export function countsToMap(rows: SpaceCountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.spaceId, (map.get(row.spaceId) ?? 0) + row.count);
  }
  return map;
}

function isUpcomingDeadline(
  item: SpaceItemRow,
  now: Date,
  horizonDays: number
): boolean {
  if (item.status !== "active") return false;
  const raw = item.dueAt ?? item.eventDate;
  if (!raw) return false;
  const due = new Date(raw.includes("T") ? raw : `${raw}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return false;
  const horizon = new Date(now.getTime() + horizonDays * 86400000);
  return due >= now && due <= horizon;
}

/**
 * Aggregate item/activity/doc/log stats for one My World card's space set.
 */
export function aggregateStatsForSpaces(args: {
  spaceIds: string[];
  items: SpaceItemRow[];
  activities: SpaceActivityRow[];
  documentCounts: Map<string, number>;
  logCounts: Map<string, number>;
  linkedPeopleCount: number;
  profileUpdatedAt: string | null;
  now?: Date;
  horizonDays?: number;
}): WorldSpaceStats {
  const now = args.now ?? new Date();
  const horizonDays = args.horizonDays ?? 30;
  const idSet = new Set(args.spaceIds);

  const items = args.items.filter((i) => idSet.has(i.spaceId));
  const active = items.filter((i) => i.status === "active");
  const openActions = active.filter((i) => i.requiresAction);
  const upcoming = active.filter((i) =>
    isUpcomingDeadline(i, now, horizonDays)
  );

  const activities = args.activities
    .filter((a) => idSet.has(a.spaceId))
    .sort((a, b) => b.at.localeCompare(a.at));
  const latestActivity = activities[0] ?? null;

  let latestItemAt: string | null = null;
  let latestItemTitle: string | null = null;
  for (const item of items) {
    if (!latestItemAt || item.updatedAt > latestItemAt) {
      latestItemAt = item.updatedAt;
      latestItemTitle = item.title;
    }
  }

  const recentActivityTitle =
    latestActivity?.title ?? latestItemTitle ?? null;
  const recentActivityAt = latestActivity?.at ?? latestItemAt ?? null;

  const candidates = [
    args.profileUpdatedAt,
    recentActivityAt,
    latestItemAt,
  ].filter((v): v is string => Boolean(v));
  candidates.sort((a, b) => b.localeCompare(a));

  return {
    itemCount: active.length,
    openActionCount: openActions.length,
    upcomingDeadlineCount: upcoming.length,
    documentCount: sumCountsForSpaces(args.documentCounts, args.spaceIds),
    logCount: sumCountsForSpaces(args.logCounts, args.spaceIds),
    linkedPeopleCount: args.linkedPeopleCount,
    recentActivityTitle,
    recentActivityAt,
    lastUpdatedAt: candidates[0] ?? null,
  };
}

export function formatWorldSummaryLine(stats: WorldSpaceStats): string {
  const parts: string[] = [];
  if (stats.openActionCount > 0) {
    parts.push(
      `${stats.openActionCount} open action${stats.openActionCount === 1 ? "" : "s"}`
    );
  }
  if (stats.upcomingDeadlineCount > 0) {
    parts.push(
      `${stats.upcomingDeadlineCount} upcoming deadline${stats.upcomingDeadlineCount === 1 ? "" : "s"}`
    );
  }
  if (parts.length === 0 && stats.itemCount > 0) {
    parts.push(
      `${stats.itemCount} thing${stats.itemCount === 1 ? "" : "s"} Guardian is tracking`
    );
  }
  if (parts.length === 0) {
    const bits: string[] = [];
    if (stats.documentCount > 0) {
      bits.push(
        `${stats.documentCount} document${stats.documentCount === 1 ? "" : "s"}`
      );
    }
    if (stats.logCount > 0) {
      bits.push(`${stats.logCount} note${stats.logCount === 1 ? "" : "s"}`);
    }
    if (bits.length > 0) return bits.join(" · ");
    return "Nothing tracked yet — add notes or ask Gideon.";
  }
  return parts.join(" · ");
}

export function buildWorldCard(input: WorldCardInput): WorldCard {
  return {
    ...input,
    summaryLine: formatWorldSummaryLine(input.stats),
  };
}

/** Sort: needs attention first, then recently updated, then name. */
export function sortWorldCards(cards: WorldCard[]): WorldCard[] {
  return [...cards].sort((a, b) => {
    if (b.stats.openActionCount !== a.stats.openActionCount) {
      return b.stats.openActionCount - a.stats.openActionCount;
    }
    if (b.stats.upcomingDeadlineCount !== a.stats.upcomingDeadlineCount) {
      return b.stats.upcomingDeadlineCount - a.stats.upcomingDeadlineCount;
    }
    const aAt = a.stats.lastUpdatedAt ?? "";
    const bAt = b.stats.lastUpdatedAt ?? "";
    if (aAt !== bAt) return bAt.localeCompare(aAt);
    return a.name.localeCompare(b.name);
  });
}

/** Filter cards the viewer is allowed to see (ids must be in authorized set). */
export function filterAuthorizedWorldCards(
  cards: WorldCard[],
  authorizedSpaceIds: Set<string>
): WorldCard[] {
  return cards.filter((c) => authorizedSpaceIds.has(c.spaceId));
}
