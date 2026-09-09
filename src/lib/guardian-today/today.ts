import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listGuardianEvents } from "@/lib/guardian-events/repository";
import { getGuardianWatch } from "@/lib/guardian-items/watch";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { loadEligibleSourceStatuses, countDailyLogSources } from "./backfill";
import { getWhatChanged } from "./changes";
import {
  deriveCoverage,
  formatCoverageSummary,
  isTrulyCaughtUp,
  needsIntelligenceBackfill,
} from "./coverage";
import { toIntelligenceItem } from "./mapItem";
import { scoreWatchItem } from "./scoring";
import {
  buildRecentFromEvents,
  mapOpenActionEvents,
  mergeAttentionLists,
} from "./sections";
import {
  TODAY_GROUP_LIMIT,
  TODAY_SCOPE_LIMIT,
  groupScoredByRootSpace,
  restrictToAuthorized,
  spaceScopeMap,
  type SpaceScopeProfile,
} from "./spaceScope";
import type {
  GuardianIntelligenceItem,
  GuardianTodayCoverage,
  GuardianTodayResult,
  GuardianTodaySpaceGroup,
  ScoredWatchItem,
} from "./types";
import { loadWorldEntityIdsForItems } from "./worldEntityIds";

async function loadSourceTitles(
  supabase: SupabaseClient,
  documentIds: string[]
): Promise<Record<string, string>> {
  if (documentIds.length === 0) return {};
  const { data } = await supabase
    .from("documents")
    .select("id, file_name")
    .in("id", documentIds);
  const map: Record<string, string> = {};
  for (const doc of data ?? []) {
    map[doc.id] = doc.file_name;
  }
  return map;
}

async function loadAccessibleSpaceIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);
  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

async function loadSpaceScopeProfiles(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<SpaceScopeProfile[]> {
  if (spaceIds.length === 0) return [];
  const { data } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type, parent_profile_id")
    .in("id", spaceIds);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    display_name: (row.display_name as string) ?? "Space",
    profile_type: (row.profile_type as string) ?? "other",
    parent_profile_id: (row.parent_profile_id as string | null) ?? null,
  }));
}

async function countActiveGuardianItems(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<number> {
  if (spaceIds.length === 0) return 0;
  try {
    const { count, error } = await supabase
      .from("guardian_items")
      .select("id", { count: "exact", head: true })
      .in("space_id", spaceIds)
      .eq("status", "active");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function emptyCoverage(spaceCount = 0): GuardianTodayCoverage {
  return {
    spaceCount,
    sourceCount: 0,
    processedSourceCount: 0,
    pendingSourceCount: 0,
    processingSourceCount: 0,
    failedSourceCount: 0,
    activeItemCount: 0,
    lastExtractionAt: null,
    lastWatchEvaluationAt: null,
    status: spaceCount === 0 ? "no_sources" : "never_scanned",
  };
}

function coverageSummaryForScope(
  coverage: GuardianTodayCoverage,
  scopeName: string | null
): string {
  if (scopeName) {
    const n = coverage.processedSourceCount;
    return `Guardian checked ${scopeName} · ${n} source${n === 1 ? "" : "s"} analyzed`;
  }
  return formatCoverageSummary(coverage);
}

function mapScoredBucket(
  items: ScoredWatchItem[],
  sourceTitles: Record<string, string>,
  worldEntityIds: Record<string, string>
): GuardianIntelligenceItem[] {
  return items.map((item) =>
    toIntelligenceItem(
      item,
      item.source_document_id
        ? sourceTitles[item.source_document_id] ?? null
        : null,
      worldEntityIds[item.id] ?? null
    )
  );
}

/**
 * Guardian Today — prioritized intelligence from Watch items + History events.
 * All Spaces stay combined in one home view, grouped by Personal / Business / etc.
 * A selected spaceId scopes to that space only (no parent/child expansion).
 * Empty priorities alone do NOT mean "caught up" — coverage must be ready.
 */
export async function getGuardianToday(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date; spaceId?: string | null } = {}
): Promise<GuardianTodayResult> {
  const now = options.now ?? new Date();
  const timeZone = await getUserTimeZone(supabase, userId);
  const today = calendarDateInUserZone(now, timeZone);
  const evaluatedAt = now.toISOString();

  const authorizedIds = await loadAccessibleSpaceIds(supabase, userId);
  const profiles = await loadSpaceScopeProfiles(supabase, authorizedIds);
  const byId = spaceScopeMap(profiles);
  const spaceNames = new Map(
    profiles.map((p) => [p.id, p.display_name] as const)
  );

  const requestedId = options.spaceId?.trim() || null;
  const scoped =
    requestedId && authorizedIds.includes(requestedId) ? requestedId : null;
  const spaceIds = scoped
    ? restrictToAuthorized([scoped], authorizedIds)
    : authorizedIds;
  const scopeProfile = scoped ? byId.get(scoped) ?? null : null;
  const scopeSpaceName = scopeProfile?.display_name ?? null;

  const [watch, sources, activeItemCount, dailyLogCount, openEvents, recentEvents] =
    await Promise.all([
      getGuardianWatch(supabase, userId, { now, spaceIds }),
      loadEligibleSourceStatuses(supabase, spaceIds),
      countActiveGuardianItems(supabase, spaceIds),
      countDailyLogSources(supabase, spaceIds),
      listGuardianEvents(supabase, {
        userId,
        spaceIds: scoped ? spaceIds : undefined,
        includeUnscoped: !scoped,
        statuses: ["open"],
        actionRequired: true,
        limit: 40,
      }),
      listGuardianEvents(supabase, {
        userId,
        spaceIds: scoped ? spaceIds : undefined,
        includeUnscoped: !scoped,
        limit: 24,
      }),
    ]);

  const attentionCandidates = [...watch.today, ...watch.needsAttention];
  const upcomingCandidates = [...watch.comingUp];
  const allCandidates = [...attentionCandidates, ...upcomingCandidates];

  const scoredAttention = attentionCandidates.map((item) =>
    scoreWatchItem({ item, today, now })
  );
  const scoredUpcoming = upcomingCandidates.map((item) =>
    scoreWatchItem({ item, today, now })
  );
  const scoredAll = allCandidates.map((item) =>
    scoreWatchItem({ item, today, now })
  );

  const grouped = groupScoredByRootSpace(
    scoredAll,
    byId,
    scoped ? TODAY_SCOPE_LIMIT : TODAY_GROUP_LIMIT
  );

  const rankedItems = grouped.flatMap((g) => g.items);
  const docIds = [
    ...new Set(
      [
        ...rankedItems,
        ...scoredAttention,
        ...scoredUpcoming,
      ]
        .map((i) => i.source_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const sourceTitles = await loadSourceTitles(supabase, docIds);

  const worldEntityIds = await loadWorldEntityIdsForItems(
    supabase,
    userId,
    [...rankedItems, ...scoredAttention, ...scoredUpcoming].map((item) => ({
      id: item.id,
      title: item.title,
      metadata: item.metadata,
      source_document_id: item.source_document_id,
    }))
  );

  const groups: GuardianTodaySpaceGroup[] = grouped.map((g) => ({
    spaceId: g.rootId,
    spaceName: g.profile?.display_name ?? g.items[0]?.space_name ?? "Space",
    profileType: g.profile?.profile_type ?? null,
    priorities: g.items.map((item) =>
      toIntelligenceItem(
        item,
        item.source_document_id
          ? sourceTitles[item.source_document_id] ?? null
          : null,
        worldEntityIds[item.id] ?? null
      )
    ),
  }));

  const watchAttention = mapScoredBucket(
    scoredAttention,
    sourceTitles,
    worldEntityIds
  );
  const upcoming = mapScoredBucket(scoredUpcoming, sourceTitles, worldEntityIds);

  const eventAttention = openEvents.ok
    ? mapOpenActionEvents(openEvents.data, spaceNames)
    : [];
  const needsAttention = mergeAttentionLists(watchAttention, eventAttention);

  const recent = recentEvents.ok
    ? buildRecentFromEvents(recentEvents.data, spaceNames, 10)
    : [];

  // Back-compat flat list = attention + upcoming (deduped by id).
  const byPriorityId = new Map<string, GuardianIntelligenceItem>();
  for (const item of [...needsAttention, ...upcoming]) {
    byPriorityId.set(item.id, item);
  }
  const priorities = [...byPriorityId.values()].sort(
    (a, b) => b.score - a.score
  );

  const whatChanged = await getWhatChanged(supabase, spaceIds);

  const dailyLogSourceRows = Array.from({ length: dailyLogCount }, (_, i) => ({
    id: `daily-log-count-${i}`,
    profile_id: spaceIds[0] ?? "space",
    analysis_status: "completed",
    guardian_items_status:
      activeItemCount > 0 ? "completed" : ("pending" as const),
    updated_at: null,
  }));

  const coverage = deriveCoverage({
    spaceIds,
    sources: [...sources, ...dailyLogSourceRows],
    activeItemCount,
    lastWatchEvaluationAt: evaluatedAt,
  });

  const caughtUp = isTrulyCaughtUp(coverage, priorities.length);
  const coverageSummary =
    coverage.status === "ready" || coverage.status === "partial"
      ? coverageSummaryForScope(coverage, scopeSpaceName)
      : null;

  return {
    priorities,
    needsAttention,
    upcoming,
    recent,
    groups,
    scopeSpaceId: scoped,
    scopeSpaceName,
    whatChanged,
    caughtUp,
    coverage,
    coverageSummary,
    backfillRecommended: needsIntelligenceBackfill(coverage),
  };
}

export { emptyCoverage };
