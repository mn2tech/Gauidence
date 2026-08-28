import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
import { rankPriorities, scoreWatchItem } from "./scoring";
import type { GuardianTodayCoverage, GuardianTodayResult } from "./types";

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

/**
 * Guardian Today — cross-space prioritized intelligence from precomputed items.
 * Empty priorities alone do NOT mean "caught up" — coverage must be ready.
 */
export async function getGuardianToday(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date } = {}
): Promise<GuardianTodayResult> {
  const now = options.now ?? new Date();
  const timeZone = await getUserTimeZone(supabase, userId);
  const today = calendarDateInUserZone(now, timeZone);
  const evaluatedAt = now.toISOString();

  const spaceIds = await loadAccessibleSpaceIds(supabase, userId);
  const [watch, sources, activeItemCount, dailyLogCount] = await Promise.all([
    getGuardianWatch(supabase, userId, { now }),
    loadEligibleSourceStatuses(supabase, spaceIds),
    countActiveGuardianItems(supabase, spaceIds),
    countDailyLogSources(supabase, spaceIds),
  ]);

  const candidates = [
    ...watch.today,
    ...watch.needsAttention,
    ...watch.comingUp,
  ];

  const scored = candidates.map((item) =>
    scoreWatchItem({ item, today, now })
  );
  const top = rankPriorities(scored);

  const docIds = [
    ...new Set(
      top
        .map((i) => i.source_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const sourceTitles = await loadSourceTitles(supabase, docIds);

  const priorities = top.map((item) =>
    toIntelligenceItem(
      item,
      item.source_document_id
        ? sourceTitles[item.source_document_id] ?? null
        : null
    )
  );

  const whatChanged = await getWhatChanged(supabase, spaceIds);

  // Synthetic source rows so Daily Logs count toward coverage / never_scanned.
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
      ? formatCoverageSummary(coverage)
      : null;

  return {
    priorities,
    whatChanged,
    caughtUp,
    coverage,
    coverageSummary,
    backfillRecommended: needsIntelligenceBackfill(coverage),
  };
}

export { emptyCoverage };
