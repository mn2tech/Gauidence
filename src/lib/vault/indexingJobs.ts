import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { indexDocumentForVault } from "./indexDocument";
import { isVaultEmbeddingConfigured } from "./embeddings";

export type DocumentIndexStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "stale";

type ExtractedRow = {
  document_id: string;
  summary: string | null;
  facts: unknown;
  title: string | null;
  document_type: string | null;
  warnings: unknown;
  specialist: unknown;
  source_text: string | null;
  source_text_indexed_at: string | null;
};

/**
 * Record documents that need indexing without blocking the caller.
 * Replaces synchronous vault-wide backfill during Gideon chat.
 */
export async function enqueueMissingVaultIndexing(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{ enqueued: number; skipped?: string }> {
  if (!isVaultEmbeddingConfigured()) {
    return { enqueued: 0, skipped: "missing_openai_key" };
  }

  const { data: extracted, error } = await supabase
    .from("extracted_data")
    .select(
      "document_id, summary, facts, title, document_type, warnings, specialist, source_text, source_text_indexed_at"
    )
    .eq("profile_id", profileId);

  if (error || !extracted?.length) {
    return { enqueued: 0 };
  }

  const { data: existing } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("profile_id", profileId);

  const already = new Set((existing ?? []).map((r) => r.document_id));

  const jobs: {
    document_id: string;
    profile_id: string;
    user_id: string;
    status: DocumentIndexStatus;
    reason: string;
  }[] = [];

  for (const row of extracted as ExtractedRow[]) {
    const hasSourceText = Boolean(row.source_text?.trim());
    const sourceNotIndexed =
      hasSourceText && row.source_text_indexed_at == null;
    const missingChunks = !already.has(row.document_id);
    if (!missingChunks && !sourceNotIndexed) continue;

    jobs.push({
      document_id: row.document_id,
      profile_id: profileId,
      user_id: userId,
      status: sourceNotIndexed && already.has(row.document_id) ? "stale" : "pending",
      reason: missingChunks
        ? "missing_chunks"
        : "source_text_not_indexed",
    });
  }

  if (jobs.length === 0) {
    return { enqueued: 0 };
  }

  const { error: upsertError } = await supabase
    .from("document_index_jobs")
    .upsert(jobs, {
      onConflict: "document_id",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error(
      "Vault index enqueue failed:",
      upsertError.message,
      { profileId }
    );
    return { enqueued: 0 };
  }

  return { enqueued: jobs.length };
}

export async function markDocumentIndexCompleted(
  supabase: SupabaseClient,
  documentId: string
): Promise<void> {
  await supabase
    .from("document_index_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("document_id", documentId);
}

export async function markDocumentIndexFailed(
  supabase: SupabaseClient,
  documentId: string,
  profileId: string,
  errorMessage: string
): Promise<void> {
  console.error("Vault index job failed:", {
    documentId,
    profileId,
    error: errorMessage,
  });
  await supabase
    .from("document_index_jobs")
    .update({
      status: "failed",
      last_error: errorMessage.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", documentId);
}

/**
 * Process pending indexing jobs (called after analyze, not during chat).
 */
export async function processPendingIndexJobs(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; profileId?: string } = {}
): Promise<{ processed: number; failed: number }> {
  if (!isVaultEmbeddingConfigured()) {
    return { processed: 0, failed: 0 };
  }

  const limit = options.limit ?? 3;

  let query = supabase
    .from("document_index_jobs")
    .select("id, document_id, profile_id, status, attempts")
    .eq("user_id", userId)
    .in("status", ["pending", "stale"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data: jobs, error } = await query;
  if (error || !jobs?.length) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    await supabase
      .from("document_index_jobs")
      .update({
        status: "processing",
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    try {
      const result = await indexDocumentFromJob(
        supabase,
        userId,
        job.document_id,
        job.profile_id
      );
      if (result.indexed > 0 || result.skipped) {
        await markDocumentIndexCompleted(supabase, job.document_id);
        processed += 1;
      } else {
        await markDocumentIndexCompleted(supabase, job.document_id);
        processed += 1;
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "error";
      await markDocumentIndexFailed(
        supabase,
        job.document_id,
        job.profile_id,
        message
      );
    }
  }

  return { processed, failed };
}

async function indexDocumentFromJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string
): Promise<{ indexed: number; skipped?: string }> {
  const { data: extracted } = await supabase
    .from("extracted_data")
    .select(
      "summary, facts, title, document_type, warnings, specialist, source_text"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (!extracted) {
    return { indexed: 0, skipped: "no_extracted_data" };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("file_name")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc?.file_name) {
    return { indexed: 0, skipped: "no_document" };
  }

  return indexDocumentForVault({
    supabase,
    userId,
    profileId,
    documentId,
    fileName: doc.file_name,
    source: {
      title: extracted.title,
      summary: extracted.summary,
      documentType: extracted.document_type,
      facts: Array.isArray(extracted.facts)
        ? (extracted.facts as { label?: string; value?: string; source?: string }[])
        : null,
      warnings: Array.isArray(extracted.warnings)
        ? (extracted.warnings as string[])
        : null,
      specialist:
        extracted.specialist && typeof extracted.specialist === "object"
          ? (extracted.specialist as Record<string, unknown>)
          : null,
      sourceText: extracted.source_text,
    },
  });
}
