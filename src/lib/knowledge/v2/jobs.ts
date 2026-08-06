import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWLEDGE_EXTRACTION_VERSION } from "@/lib/features/knowledge-engine-v2";

export type KnowledgeExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable"
  | "stale";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export async function enqueueKnowledgeExtractionJob(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
    reason?: string;
  }
): Promise<{ enqueued: boolean }> {
  const { error } = await supabase.from("guardian_knowledge_extraction_jobs").upsert(
    {
      document_id: args.documentId,
      profile_id: args.profileId,
      user_id: args.userId,
      status: "pending",
      extraction_version: KNOWLEDGE_EXTRACTION_VERSION,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "document_id,extraction_version" }
  );

  if (error) {
    console.error("Knowledge extraction enqueue failed:", error.message, args);
    return { enqueued: false };
  }
  return { enqueued: true };
}

export async function processPendingKnowledgeJobs(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number } = {}
): Promise<{ processed: number; failed: number }> {
  const limit = options.limit ?? 2;
  const now = new Date().toISOString();

  const { data: jobs } = await supabase
    .from("guardian_knowledge_extraction_jobs")
    .select("id, document_id, profile_id, attempts, status")
    .eq("user_id", userId)
    .in("status", ["pending", "retryable", "stale"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!jobs?.length) return { processed: 0, failed: 0 };

  const { processKnowledgeExtractionJob } = await import("./processJob");

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await supabase
        .from("guardian_knowledge_extraction_jobs")
        .update({
          status: "processing",
          attempts: (job.attempts ?? 0) + 1,
          processing_started_at: now,
          updated_at: now,
        })
        .eq("id", job.id);

      await processKnowledgeExtractionJob(supabase, userId, job.document_id, job.profile_id);

      await supabase
        .from("guardian_knowledge_extraction_jobs")
        .update({
          status: "completed",
          processing_completed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      processed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "error";
      const attempts = (job.attempts ?? 0) + 1;
      const retryable = attempts < MAX_ATTEMPTS;

      await supabase
        .from("guardian_knowledge_extraction_jobs")
        .update({
          status: retryable ? "retryable" : "failed",
          last_error: message.slice(0, 500),
          next_retry_at: retryable
            ? new Date(Date.now() + RETRY_DELAY_MS).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      console.error("Knowledge extraction job failed:", {
        documentId: job.document_id,
        profileId: job.profile_id,
        error: message,
      });
    }
  }

  return { processed, failed };
}
