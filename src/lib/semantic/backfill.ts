import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { retryDocumentProcessing } from "@/lib/documents/processingJobs";
import { logSemanticEvent } from "./log";

const ANALYZED = new Set(["completed", "needs_verification"]);
const NEEDS_SEMANTIC = new Set([
  "pending",
  "failed",
  "retryable",
  "skipped",
]);

export type SemanticBackfillQueueResult = {
  queued: number;
  skipped: number;
  documentIds: string[];
  spaceCount: number;
  remainingEstimate: number | null;
};

export type SemanticBackfillStatus = {
  spaceCount: number;
  analyzedSources: number;
  semanticPending: number;
  semanticCompleted: number;
  semanticFailed: number;
  semanticProcessing: number;
  semanticSkipped: number;
};

async function loadAccessibleSpaceIds(
  supabase: SupabaseClient,
  userId: string,
  spaceId?: string
): Promise<string[]> {
  if (spaceId) {
    const { data } = await supabase
      .from("guardian_profile_members")
      .select("profile_id")
      .eq("user_id", userId)
      .eq("profile_id", spaceId)
      .maybeSingle();
    return data?.profile_id ? [data.profile_id] : [];
  }

  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);

  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

/**
 * Progress across all Spaces the user can access.
 */
export async function getSemanticBackfillStatus(
  supabase: SupabaseClient,
  userId: string,
  spaceId?: string
): Promise<SemanticBackfillStatus> {
  const spaceIds = await loadAccessibleSpaceIds(supabase, userId, spaceId);
  if (spaceIds.length === 0) {
    return {
      spaceCount: 0,
      analyzedSources: 0,
      semanticPending: 0,
      semanticCompleted: 0,
      semanticFailed: 0,
      semanticProcessing: 0,
      semanticSkipped: 0,
    };
  }

  const { data } = await supabase
    .from("documents")
    .select("id, semantic_status, analysis_status")
    .in("profile_id", spaceIds)
    .in("analysis_status", [...ANALYZED])
    .limit(2000);

  const rows = data ?? [];
  let semanticPending = 0;
  let semanticCompleted = 0;
  let semanticFailed = 0;
  let semanticProcessing = 0;
  let semanticSkipped = 0;

  for (const row of rows) {
    const status = (row.semantic_status as string | null) ?? "pending";
    if (status === "completed") semanticCompleted += 1;
    else if (status === "failed") semanticFailed += 1;
    else if (status === "processing") semanticProcessing += 1;
    else if (status === "skipped") semanticSkipped += 1;
    else semanticPending += 1; // pending | retryable | unknown
  }

  return {
    spaceCount: spaceIds.length,
    analyzedSources: rows.length,
    semanticPending,
    semanticCompleted,
    semanticFailed,
    semanticProcessing,
    semanticSkipped,
  };
}

/**
 * Queue extract_semantic jobs for analyzed documents that still need Semantic Layer.
 * Batch-limited so admin can click repeatedly / cron can drain safely.
 * Does not process inline — relies on existing document-processing workers.
 */
export async function queueSemanticBackfill(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId?: string;
    limit?: number;
    includeCompleted?: boolean;
  }
): Promise<SemanticBackfillQueueResult> {
  if (!isGuardianSemanticLayerEnabled()) {
    throw new Error("Semantic Layer is disabled");
  }

  const spaceIds = await loadAccessibleSpaceIds(
    supabase,
    args.userId,
    args.spaceId
  );

  if (spaceIds.length === 0) {
    return {
      queued: 0,
      skipped: 0,
      documentIds: [],
      spaceCount: 0,
      remainingEstimate: 0,
    };
  }

  // Cap batch size to protect serverless timeouts / LLM spend per click
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);

  let query = supabase
    .from("documents")
    .select("id, profile_id, semantic_status, analysis_status")
    .in("profile_id", spaceIds)
    .in("analysis_status", [...ANALYZED])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!args.includeCompleted) {
    query = query.in("semantic_status", [...NEEDS_SEMANTIC]);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const queuedIds: string[] = [];
  let skipped = 0;

  for (const doc of data ?? []) {
    const status = (doc.semantic_status as string | null) ?? "pending";
    if (!args.includeCompleted && status === "completed") {
      skipped += 1;
      continue;
    }
    if (status === "processing") {
      skipped += 1;
      continue;
    }

    try {
      await supabase
        .from("documents")
        .update({
          semantic_status: "pending",
          last_processing_error: null,
        })
        .eq("id", doc.id);

      await retryDocumentProcessing(supabase, {
        documentId: doc.id,
        profileId: doc.profile_id,
        userId: args.userId,
        stage: "extract_semantic",
      });
      queuedIds.push(doc.id);
    } catch (err) {
      console.error(
        "Semantic backfill enqueue failed:",
        doc.id,
        err instanceof Error ? err.message : err
      );
      skipped += 1;
    }
  }

  const status = await getSemanticBackfillStatus(
    supabase,
    args.userId,
    args.spaceId
  );
  const remainingEstimate =
    status.semanticPending + status.semanticFailed + status.semanticSkipped;

  logSemanticEvent("semantic_backfill_queued", {
    user_id: args.userId,
    source_id: "backfill",
    entities_created: queuedIds.length,
    entities_resolved: skipped,
    relationships: spaceIds.length,
    facts: remainingEstimate ?? 0,
    evidence_links: 0,
    resolutions: queuedIds.length,
  });

  return {
    queued: queuedIds.length,
    skipped,
    documentIds: queuedIds,
    spaceCount: spaceIds.length,
    remainingEstimate,
  };
}
