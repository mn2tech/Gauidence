import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { isVaultEmbeddingConfigured } from "@/lib/vault/embeddings";
import {
  createDiagnostics,
  logProcessingDiagnostics,
  mergeDiagnostics,
  recordDuration,
  type ProcessingDiagnostics,
} from "./processingDiagnostics";
import {
  executeDocumentAnalysis,
  runOrganizationAfterAnalysisSafe,
  triggerLegacyKnowledgeEngines,
} from "./executeAnalysis";

export const PIPELINE_VERSION = "v1";
export const MAX_JOB_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 5 * 60 * 1000;

export type ProcessingJobType =
  | "analyze_document"
  | "index_document"
  | "extract_knowledge";

export type ProcessingJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable";

const STAGE_TIMEOUT_MS: Record<ProcessingJobType, number> = {
  analyze_document: 10 * 60 * 1000,
  index_document: 5 * 60 * 1000,
  extract_knowledge: 5 * 60 * 1000,
};

export function processingConcurrencyLimit(): number {
  const raw = process.env.DOCUMENT_PROCESSING_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : 2;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

export async function enqueueDocumentProcessingJob(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
    jobType: ProcessingJobType;
    force?: boolean;
  }
): Promise<{ enqueued: boolean; jobId?: string }> {
  const existing = await supabase
    .from("document_processing_jobs")
    .select("id, status")
    .eq("document_id", args.documentId)
    .eq("job_type", args.jobType)
    .eq("pipeline_version", PIPELINE_VERSION)
    .maybeSingle();

  if (
    existing.data &&
    !args.force &&
    ["pending", "processing", "completed"].includes(existing.data.status)
  ) {
    return { enqueued: false, jobId: existing.data.id };
  }

  const { data, error } = await supabase
    .from("document_processing_jobs")
    .upsert(
      {
        document_id: args.documentId,
        profile_id: args.profileId,
        user_id: args.userId,
        job_type: args.jobType,
        pipeline_version: PIPELINE_VERSION,
        status: "pending",
        attempts: 0,
        last_error: null,
        error_category: null,
        next_retry_at: null,
        processing_started_at: null,
        processing_completed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "document_id,job_type,pipeline_version" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("Document processing enqueue failed:", error.message, args);
    return { enqueued: false };
  }

  return { enqueued: true, jobId: data.id };
}

export async function enqueueAnalyzePipeline(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<{ jobId?: string }> {
  const queueStart = Date.now();
  await supabase
    .from("documents")
    .update({
      analysis_status: "queued",
      processing_step: "queued",
      processing_started_at: new Date().toISOString(),
      last_processing_error: null,
    })
    .eq("id", args.documentId);

  const { jobId } = await enqueueDocumentProcessingJob(supabase, {
    ...args,
    jobType: "analyze_document",
  });

  logProcessingDiagnostics(args.documentId, "queue_create", {
    queue_create_ms: Date.now() - queueStart,
  });

  return { jobId };
}

async function enqueueNextStage(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
    completedStage: ProcessingJobType;
  }
): Promise<void> {
  const { completedStage } = args;
  if (completedStage === "analyze_document") {
    if (!isVaultEmbeddingConfigured()) {
      await supabase
        .from("documents")
        .update({
          indexing_status: "skipped",
          processing_step: "ready",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", args.documentId);
      return;
    }
    await supabase
      .from("documents")
      .update({ indexing_status: "pending", processing_step: "indexing" })
      .eq("id", args.documentId);
    await enqueueDocumentProcessingJob(supabase, {
      ...args,
      jobType: "index_document",
    });
    return;
  }

  if (completedStage === "index_document") {
    if (!isKnowledgeEngineV2Enabled()) {
      await supabase
        .from("documents")
        .update({
          knowledge_status: "skipped",
          processing_step: "ready",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", args.documentId);
      return;
    }
    await supabase
      .from("documents")
      .update({
        knowledge_status: "pending",
        processing_step: "knowledge",
      })
      .eq("id", args.documentId);
    await enqueueDocumentProcessingJob(supabase, {
      ...args,
      jobType: "extract_knowledge",
    });
  }
}

async function markJobFailed(
  supabase: SupabaseClient,
  job: { id: string; document_id: string; attempts: number; job_type: ProcessingJobType },
  message: string,
  category: string,
  options?: { immediateRetry?: boolean }
): Promise<void> {
  const retryable = (job.attempts ?? 0) < MAX_JOB_ATTEMPTS;
  await supabase
    .from("document_processing_jobs")
    .update({
      status: retryable ? "retryable" : "failed",
      last_error: message.slice(0, 500),
      error_category: category,
      next_retry_at: retryable
        ? options?.immediateRetry
          ? new Date().toISOString()
          : new Date(Date.now() + RETRY_DELAY_MS).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (job.job_type === "analyze_document") {
    await supabase
      .from("documents")
      .update({
        analysis_status: retryable ? "uploaded" : "failed",
        last_processing_error: message.slice(0, 500),
        processing_step: retryable ? "queued" : "failed",
      })
      .eq("id", job.document_id);
  } else if (job.job_type === "index_document") {
    await supabase
      .from("documents")
      .update({
        indexing_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
        processing_step: retryable ? "indexing" : "failed",
      })
      .eq("id", job.document_id);
  } else {
    await supabase
      .from("documents")
      .update({
        knowledge_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", job.document_id);
    if (retryable) {
      await supabase
        .from("documents")
        .update({
          processing_step: "ready",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", job.document_id);
    }
  }
}

async function runAnalyzeJob(
  supabase: SupabaseClient,
  user: User,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<ProcessingDiagnostics> {
  const { data: doc } = await supabase
    .from("documents")
    .select("file_name")
    .eq("id", documentId)
    .maybeSingle();

  const result = await executeDocumentAnalysis(supabase, user, {
    documentId,
    timeZone: GUARDIAN_TIME_ZONE,
    diagnostics,
  });

  const { data: guardianProfile } = await supabase
    .from("guardian_profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();

  await runOrganizationAfterAnalysisSafe(supabase, {
    userId: user.id,
    documentId,
    currentProfileId: profileId,
    currentProfileName: guardianProfile?.display_name ?? null,
    analysis: result.analysis,
    classification: result.classification,
  });

  await triggerLegacyKnowledgeEngines(supabase, {
    userId: user.id,
    documentId,
    profileId,
    fileName: doc?.file_name ?? "document",
    sourceText: result.sourceText,
    analysis: result.analysis,
  });

  return result.diagnostics ?? diagnostics;
}

async function runIndexJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<ProcessingDiagnostics> {
  const indexStart = Date.now();
  await supabase
    .from("documents")
    .update({ indexing_status: "processing", processing_step: "indexing" })
    .eq("id", documentId);

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select(
      "summary, facts, title, document_type, warnings, specialist, source_text"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (!extracted) {
    throw new Error("No extracted_data for indexing");
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("file_name")
    .eq("id", documentId)
    .maybeSingle();

  const { indexDocumentForVault } = await import("@/lib/vault/indexDocument");
  const { markDocumentIndexCompleted } = await import("@/lib/vault/indexingJobs");

  await indexDocumentForVault({
    supabase,
    userId,
    profileId,
    documentId,
    fileName: doc?.file_name ?? "document",
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

  await markDocumentIndexCompleted(supabase, documentId);
  await supabase
    .from("documents")
    .update({
      indexing_status: "completed",
      processing_step: "knowledge",
    })
    .eq("id", documentId);

  diagnostics = recordDuration(diagnostics, "embedding_ms", indexStart);
  diagnostics = mergeDiagnostics(diagnostics, {
    total_to_searchable_ms: Date.now() - indexStart,
  });
  return diagnostics;
}

async function runKnowledgeJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<ProcessingDiagnostics> {
  const knowledgeStart = Date.now();
  await supabase
    .from("documents")
    .update({
      knowledge_status: "processing",
      processing_step: "knowledge",
    })
    .eq("id", documentId);

  const { enqueueKnowledgeExtractionJob } = await import(
    "@/lib/knowledge/v2/jobs"
  );
  await enqueueKnowledgeExtractionJob(supabase, {
    documentId,
    profileId,
    userId,
    reason: "processing_pipeline",
  });

  const { processKnowledgeExtractionJob } = await import(
    "@/lib/knowledge/v2/processJob"
  );
  await processKnowledgeExtractionJob(supabase, userId, documentId, profileId);

  await supabase
    .from("documents")
    .update({
      knowledge_status: "completed",
      processing_step: "ready",
      processing_completed_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  diagnostics = recordDuration(
    diagnostics,
    "knowledge_extraction_ms",
    knowledgeStart
  );
  diagnostics = mergeDiagnostics(diagnostics, {
    total_to_knowledge_ready_ms: Date.now() - knowledgeStart,
  });
  return diagnostics;
}

export async function processDocumentProcessingJob(
  supabase: SupabaseClient,
  user: User,
  job: {
    id: string;
    document_id: string;
    profile_id: string;
    job_type: ProcessingJobType;
    attempts: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  let diagnostics = createDiagnostics();

  await supabase
    .from("document_processing_jobs")
    .update({
      status: "processing",
      attempts: (job.attempts ?? 0) + 1,
      processing_started_at: now,
      updated_at: now,
    })
    .eq("id", job.id);

  try {
    if (job.job_type === "analyze_document") {
      diagnostics = await runAnalyzeJob(
        supabase,
        user,
        job.document_id,
        job.profile_id,
        diagnostics
      );
    } else if (job.job_type === "index_document") {
      diagnostics = await runIndexJob(
        supabase,
        user.id,
        job.document_id,
        job.profile_id,
        diagnostics
      );
    } else {
      diagnostics = await runKnowledgeJob(
        supabase,
        user.id,
        job.document_id,
        job.profile_id,
        diagnostics
      );
    }

    await supabase
      .from("document_processing_jobs")
      .update({
        status: "completed",
        processing_completed_at: new Date().toISOString(),
        last_error: null,
        diagnostics,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await enqueueNextStage(supabase, {
      documentId: job.document_id,
      profileId: job.profile_id,
      userId: user.id,
      completedStage: job.job_type,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    await markJobFailed(
      supabase,
      { ...job, attempts: (job.attempts ?? 0) + 1 },
      message,
      job.job_type
    );
    throw err;
  }
}

export type RecoverStaleProcessingJobsOptions = {
  olderThanMs?: Partial<Record<ProcessingJobType, number>>;
};

export async function recoverStaleProcessingJobs(
  supabase: SupabaseClient,
  options?: RecoverStaleProcessingJobsOptions
): Promise<number> {
  let recovered = 0;
  const now = Date.now();

  for (const [jobType, defaultTimeoutMs] of Object.entries(STAGE_TIMEOUT_MS) as [
    ProcessingJobType,
    number,
  ][]) {
    const timeoutMs = options?.olderThanMs?.[jobType] ?? defaultTimeoutMs;
    const threshold = new Date(now - timeoutMs).toISOString();
    const { data: stale } = await supabase
      .from("document_processing_jobs")
      .select("id, document_id, job_type, attempts")
      .eq("status", "processing")
      .eq("job_type", jobType)
      .lt("processing_started_at", threshold)
      .limit(20);

    for (const job of stale ?? []) {
      await markJobFailed(
        supabase,
        {
          id: job.id,
          document_id: job.document_id,
          job_type: job.job_type as ProcessingJobType,
          attempts: job.attempts ?? 0,
        },
        "Processing timed out",
        "timeout",
        { immediateRetry: true }
      );
      recovered += 1;
    }
  }

  return recovered;
}

export async function processPendingDocumentJobs(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; profileId?: string } = {}
): Promise<{ processed: number; failed: number }> {
  const limit = options.limit ?? processingConcurrencyLimit();
  const now = new Date().toISOString();

  let query = supabase
    .from("document_processing_jobs")
    .select("id, document_id, profile_id, job_type, attempts, status")
    .eq("user_id", userId)
    .in("status", ["pending", "retryable"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data: jobs } = await query;
  if (!jobs?.length) return { processed: 0, failed: 0 };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await processDocumentProcessingJob(supabase, user, {
        id: job.id,
        document_id: job.document_id,
        profile_id: job.profile_id,
        job_type: job.job_type as ProcessingJobType,
        attempts: job.attempts ?? 0,
      });
      processed += 1;

      void processPendingDocumentJobs(supabase, userId, {
        limit: 1,
        profileId: options.profileId,
      }).catch(() => {});
    } catch {
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function processPendingDocumentJobsAdmin(
  supabase: SupabaseClient,
  options: { limit?: number } = {}
): Promise<{ processed: number; failed: number; recovered: number }> {
  await recoverStaleProcessingJobs(supabase);
  const limit = options.limit ?? processingConcurrencyLimit() * 2;

  const { data: jobs } = await supabase
    .from("document_processing_jobs")
    .select("id, document_id, profile_id, user_id, job_type, attempts, status")
    .in("status", ["pending", "retryable"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!jobs?.length) {
    return { processed: 0, failed: 0, recovered: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", job.user_id)
      .maybeSingle();
    const user = {
      id: job.user_id,
      email: profile?.email ?? undefined,
    } as User;
    try {
      await processDocumentProcessingJob(supabase, user, {
        id: job.id,
        document_id: job.document_id,
        profile_id: job.profile_id,
        job_type: job.job_type as ProcessingJobType,
        attempts: job.attempts ?? 0,
      });
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed, failed, recovered: 0 };
}

export async function retryDocumentProcessing(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
    stage?: ProcessingJobType;
  }
): Promise<{ jobId?: string }> {
  const stage = args.stage ?? "analyze_document";

  if (stage === "index_document") {
    await supabase
      .from("documents")
      .update({ indexing_status: "pending", last_processing_error: null })
      .eq("id", args.documentId);
  } else if (stage === "extract_knowledge") {
    await supabase
      .from("documents")
      .update({ knowledge_status: "pending", last_processing_error: null })
      .eq("id", args.documentId);
  } else {
    await supabase
      .from("documents")
      .update({
        analysis_status: "queued",
        last_processing_error: null,
        processing_step: "queued",
      })
      .eq("id", args.documentId);
  }

  const { jobId } = await enqueueDocumentProcessingJob(supabase, {
    ...args,
    jobType: stage,
    force: true,
  });

  return { jobId };
}
