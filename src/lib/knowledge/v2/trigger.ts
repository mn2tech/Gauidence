import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { enqueueKnowledgeExtractionJob } from "./jobs";

/**
 * Enqueue knowledge extraction after document analysis — non-blocking.
 */
export async function triggerKnowledgeEngineV2(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<void> {
  if (!isKnowledgeEngineV2Enabled()) return;

  await enqueueKnowledgeExtractionJob(supabase, args);

  void import("./jobs").then(({ processPendingKnowledgeJobs }) =>
    processPendingKnowledgeJobs(supabase, args.userId, { limit: 1 }).catch(
      (err) => {
        console.error(
          "Knowledge job drain failed:",
          err instanceof Error ? err.message : "error"
        );
      }
    )
  );
}
