import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enqueueMissingVaultIndexing,
  processPendingIndexJobs,
} from "./indexingJobs";

/**
 * @deprecated Use enqueueMissingVaultIndexing during chat; processPendingIndexJobs after analyze.
 * Kept for backward compatibility — now only enqueues pending jobs (non-blocking).
 */
export async function ensureUserVaultIndexed(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{ indexedDocs: number; skipped?: string }> {
  const { enqueued, skipped } = await enqueueMissingVaultIndexing(
    supabase,
    userId,
    profileId
  );
  return { indexedDocs: enqueued, skipped };
}

export {
  enqueueMissingVaultIndexing,
  processPendingIndexJobs,
  markDocumentIndexCompleted,
  markDocumentIndexFailed,
} from "./indexingJobs";
export type { DocumentIndexStatus } from "./indexingJobs";
