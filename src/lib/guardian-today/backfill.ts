import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { retryDocumentProcessing } from "@/lib/documents/processingJobs";
import type { SourceStatusRow } from "./coverage";

const ANALYZED = new Set(["completed", "needs_verification"]);
const NEEDS_EXTRACTION = new Set([
  "pending",
  "failed",
  "retryable",
]);

export type BackfillResult = {
  queued: number;
  skipped: number;
  documentIds: string[];
};

/**
 * Idempotent backfill: queue extract_guardian_items for analyzed docs that
 * never completed Guardian intelligence extraction.
 * Also syncs recent Daily Logs into guardian_items (dated events).
 * Respects Space membership via caller-supplied accessible spaceIds.
 */
export async function queueGuardianIntelligenceBackfill(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceIds: string[];
    limit?: number;
  }
): Promise<BackfillResult> {
  if (args.spaceIds.length === 0) {
    return { queued: 0, skipped: 0, documentIds: [] };
  }

  const limit = Math.min(Math.max(args.limit ?? 8, 1), 12);

  const { data, error } = await supabase
    .from("documents")
    .select("id, profile_id, guardian_items_status, analysis_status")
    .in("profile_id", args.spaceIds)
    .in("analysis_status", [...ANALYZED])
    .in("guardian_items_status", [...NEEDS_EXTRACTION])
    .order("updated_at", { ascending: false })
    .limit(limit);

  const queuedIds: string[] = [];
  let skipped = 0;

  if (!error && data?.length) {
    for (const doc of data) {
      try {
        await retryDocumentProcessing(supabase, {
          documentId: doc.id,
          profileId: doc.profile_id,
          userId: args.userId,
          stage: "extract_guardian_items",
        });
        queuedIds.push(doc.id);
      } catch {
        skipped += 1;
      }
    }
  }

  // Sync dated events from recent Daily Logs (no LLM).
  try {
    const { syncGuardianItemsFromDailyLog } = await import(
      "@/lib/guardian-items/fromDailyLog"
    );
    const { data: logs } = await supabase
      .from("daily_logs")
      .select("id, profile_id, title, content, log_date")
      .in("profile_id", args.spaceIds)
      .order("updated_at", { ascending: false })
      .limit(40);

    for (const log of logs ?? []) {
      const result = await syncGuardianItemsFromDailyLog(supabase, {
        userId: args.userId,
        log: {
          id: log.id,
          profile_id: log.profile_id,
          title: log.title,
          content: log.content,
          log_date: log.log_date,
        },
      });
      if (result.created === 0) skipped += result.skipped;
    }
  } catch (err) {
    console.error("Daily log intelligence backfill failed:", err);
  }

  return {
    queued: queuedIds.length,
    skipped,
    documentIds: queuedIds,
  };
}

export async function loadEligibleSourceStatuses(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<SourceStatusRow[]> {
  if (spaceIds.length === 0) return [];

  // Keep this light — /home must stay fast so Spaces ↔ Ask Gideon nav stays snappy.
  // Prefer full select; fall back if guardian_items_status migration is missing.
  const full = await supabase
    .from("documents")
    .select("id, profile_id, guardian_items_status, analysis_status, updated_at")
    .in("profile_id", spaceIds)
    .in("analysis_status", [...ANALYZED])
    .order("updated_at", { ascending: false })
    .limit(400);

  if (!full.error && full.data) {
    return full.data as SourceStatusRow[];
  }

  const fallback = await supabase
    .from("documents")
    .select("id, profile_id, analysis_status, updated_at")
    .in("profile_id", spaceIds)
    .in("analysis_status", [...ANALYZED])
    .order("updated_at", { ascending: false })
    .limit(400);

  if (fallback.error) {
    console.error(
      "loadEligibleSourceStatuses failed:",
      full.error?.message ?? fallback.error.message
    );
    return [];
  }

  return (fallback.data ?? []).map((row) => ({
    id: row.id as string,
    profile_id: row.profile_id as string,
    analysis_status: row.analysis_status as string | null,
    guardian_items_status: "pending",
    updated_at: (row.updated_at as string | null) ?? null,
  }));
}

/** Count Daily Logs in accessible Spaces — they are intelligence sources too. */
export async function countDailyLogSources(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<number> {
  if (spaceIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("daily_logs")
    .select("id", { count: "exact", head: true })
    .in("profile_id", spaceIds);
  if (error) return 0;
  return count ?? 0;
}
