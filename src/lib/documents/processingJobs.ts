import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
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
  | "extract_ontology"
  | "extract_semantic"
  | "extract_guardian_items"
  | "extract_knowledge";

export type ProcessingJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable";

const STAGE_TIMEOUT_MS: Record<ProcessingJobType, number> = {
  /** Must stay above process-jobs maxDuration (300s) and status-poll stale window. */
  analyze_document: 6 * 60 * 1000,
  index_document: 5 * 60 * 1000,
  extract_ontology: 5 * 60 * 1000,
  extract_semantic: 5 * 60 * 1000,
  extract_guardian_items: 5 * 60 * 1000,
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

  const existing = await supabase
    .from("document_processing_jobs")
    .select("id, status")
    .eq("document_id", args.documentId)
    .eq("job_type", "analyze_document")
    .eq("pipeline_version", PIPELINE_VERSION)
    .maybeSingle();

  // Never reset a live worker — that restarts analysis and leaves "Reading document" forever.
  if (
    existing.data &&
    (existing.data.status === "pending" || existing.data.status === "processing")
  ) {
    if (existing.data.status === "pending") {
      await supabase
        .from("documents")
        .update({
          analysis_status: "queued",
          processing_step: "queued",
          last_processing_error: null,
        })
        .eq("id", args.documentId);
    }
    logProcessingDiagnostics(args.documentId, "queue_create", {
      queue_create_ms: Date.now() - queueStart,
    });
    return { jobId: existing.data.id };
  }

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
    force: true,
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
    if (isVaultEmbeddingConfigured()) {
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
    // No embeddings — skip indexing but still run ontology when enabled
    // (Pack analyze / OCR-before-ontology depends on this chain).
    await supabase
      .from("documents")
      .update({ indexing_status: "skipped" })
      .eq("id", args.documentId);
    if (isGuardianOntologyEnabled()) {
      await supabase
        .from("documents")
        .update({
          ontology_status: "pending",
          processing_step: "ontology",
        })
        .eq("id", args.documentId);
      await enqueueDocumentProcessingJob(supabase, {
        ...args,
        jobType: "extract_ontology",
        force: true,
      });
      return;
    }
    await enqueueSemanticOrGuardianItems(supabase, args);
    return;
  }

  if (completedStage === "index_document") {
    if (isGuardianOntologyEnabled()) {
      await supabase
        .from("documents")
        .update({
          ontology_status: "pending",
          processing_step: "ontology",
        })
        .eq("id", args.documentId);
      await enqueueDocumentProcessingJob(supabase, {
        ...args,
        jobType: "extract_ontology",
        force: true,
      });
      return;
    }
    await enqueueSemanticOrGuardianItems(supabase, args);
    return;
  }

  if (completedStage === "extract_ontology") {
    await enqueueSemanticOrGuardianItems(supabase, args);
    return;
  }

  if (completedStage === "extract_semantic") {
    // Guardian items are enqueued in parallel with semantic; only recover
    // if that stage failed / never completed.
    const { data: doc } = await supabase
      .from("documents")
      .select("guardian_items_status")
      .eq("id", args.documentId)
      .maybeSingle();
    const gi = doc?.guardian_items_status ?? "pending";
    if (
      gi === "completed" ||
      gi === "skipped" ||
      gi === "processing" ||
      gi === "pending"
    ) {
      return;
    }
    await enqueueGuardianItemsOrKnowledge(supabase, args);
    return;
  }

  if (completedStage === "extract_guardian_items") {
    await enqueueKnowledgeOrReady(supabase, args);
  }
}

/**
 * After analysis/index/ontology: start Guardian Items promptly for Today/Watch,
 * and run Semantic Layer in parallel when enabled (do not block attention items).
 */
async function enqueueSemanticOrGuardianItems(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<void> {
  // Always queue Watch/Today extraction first so chat uploads surface soon.
  await enqueueGuardianItemsOrKnowledge(supabase, args);

  if (isGuardianSemanticLayerEnabled()) {
    await supabase
      .from("documents")
      .update({
        semantic_status: "pending",
      })
      .eq("id", args.documentId);
    await enqueueDocumentProcessingJob(supabase, {
      ...args,
      jobType: "extract_semantic",
      force: true,
    });
  }
}

async function enqueueGuardianItemsOrKnowledge(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<void> {
  await supabase
    .from("documents")
    .update({
      guardian_items_status: "pending",
      processing_step: "guardian_items",
    })
    .eq("id", args.documentId);
  await enqueueDocumentProcessingJob(supabase, {
    ...args,
    jobType: "extract_guardian_items",
    force: true,
  });
}

/** Force-queue Watch/Today extraction (e.g. after a Gideon chat attachment). */
export async function enqueueGuardianItemsPipeline(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<void> {
  await enqueueGuardianItemsOrKnowledge(supabase, args);
}

async function enqueueKnowledgeOrReady(
  supabase: SupabaseClient,
  args: {
    documentId: string;
    profileId: string;
    userId: string;
  }
): Promise<void> {
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
        processing_step: "failed",
      })
      .eq("id", job.document_id);
    await supabase
      .from("extracted_data")
      .update({
        vision_status: "failed",
        vision_error: message.slice(0, 500),
      })
      .eq("document_id", job.document_id);
  } else if (job.job_type === "index_document") {
    await supabase
      .from("documents")
      .update({
        indexing_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
        processing_step: retryable ? "indexing" : "failed",
      })
      .eq("id", job.document_id);
  } else if (job.job_type === "extract_ontology") {
    await supabase
      .from("documents")
      .update({
        ontology_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", job.document_id);
  } else if (job.job_type === "extract_semantic") {
    await supabase
      .from("documents")
      .update({
        semantic_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", job.document_id);
  } else if (job.job_type === "extract_guardian_items") {
    await supabase
      .from("documents")
      .update({
        guardian_items_status: retryable ? "retryable" : "failed",
        last_processing_error: message.slice(0, 500),
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

async function persistDocumentProcessingDiagnostics(
  supabase: SupabaseClient,
  documentId: string,
  patch: ProcessingDiagnostics
): Promise<void> {
  const { data } = await supabase
    .from("documents")
    .select("processing_diagnostics")
    .eq("id", documentId)
    .maybeSingle();

  const merged = mergeDiagnostics(
    (data?.processing_diagnostics as ProcessingDiagnostics | null) ?? null,
    patch
  );

  await supabase
    .from("documents")
    .update({ processing_diagnostics: merged })
    .eq("id", documentId);

  logProcessingDiagnostics(documentId, "persist", merged);
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

  const orgStart = Date.now();
  await runOrganizationAfterAnalysisSafe(supabase, {
    userId: user.id,
    documentId,
    currentProfileId: profileId,
    currentProfileName: guardianProfile?.display_name ?? null,
    analysis: result.analysis,
    classification: result.classification,
  });

  diagnostics = recordDuration(diagnostics, "organization_ms", orgStart);

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
    .select("file_name, mime_type, content_type")
    .eq("id", documentId)
    .maybeSingle();

  const { indexDocumentForVault } = await import("@/lib/vault/indexDocument");
  const { markDocumentIndexCompleted } = await import("@/lib/vault/indexingJobs");

  const contentType =
    doc?.content_type === "image" ||
    doc?.content_type === "pdf" ||
    doc?.content_type === "document" ||
    doc?.content_type === "generic"
      ? doc.content_type
      : doc?.mime_type?.startsWith("image/")
        ? "image"
        : undefined;

  const indexed = await indexDocumentForVault({
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
      contentType,
    },
  });

  if (indexed.skipped === "missing_openai_key") {
    await supabase
      .from("documents")
      .update({
        indexing_status: "skipped",
        processing_step: "ready",
        processing_completed_at: new Date().toISOString(),
        last_processing_error: null,
      })
      .eq("id", documentId);
    return diagnostics;
  }

  await markDocumentIndexCompleted(supabase, documentId);
  await supabase
    .from("documents")
    .update({
      indexing_status: "completed",
      processing_step: isGuardianOntologyEnabled() ? "ontology" : "knowledge",
    })
    .eq("id", documentId);

  diagnostics = recordDuration(diagnostics, "embedding_ms", indexStart);
  diagnostics = mergeDiagnostics(diagnostics, {
    total_to_searchable_ms: Date.now() - indexStart,
  });
  return diagnostics;
}

async function documentHasExtractedText(
  supabase: SupabaseClient,
  documentId: string
): Promise<boolean> {
  const { data: extracted } = await supabase
    .from("extracted_data")
    .select("source_text, title, summary")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!extracted) return false;
  const text =
    String(extracted.source_text ?? "").trim() ||
    [extracted.title, extracted.summary].filter(Boolean).join("\n").trim();
  return Boolean(text);
}

async function runOntologyJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<{ diagnostics: ProcessingDiagnostics; deferredForOcr: boolean }> {
  const ontologyStart = Date.now();

  // Auto-OCR: if ontology was queued without text, run analysis first and
  // let the pipeline re-chain to ontology after OCR completes.
  if (!(await documentHasExtractedText(supabase, documentId))) {
    await enqueueAnalyzePipeline(supabase, {
      documentId,
      profileId,
      userId,
    });
    await supabase
      .from("documents")
      .update({
        ontology_status: "pending",
        processing_step: "queued",
        last_processing_error: null,
      })
      .eq("id", documentId);
    return {
      diagnostics: recordDuration(
        diagnostics,
        "ontology_extraction_ms",
        ontologyStart
      ),
      deferredForOcr: true,
    };
  }

  await supabase
    .from("documents")
    .update({
      ontology_status: "processing",
      processing_step: "ontology",
    })
    .eq("id", documentId);

  try {
    const { processOntologyExtraction } = await import(
      "@/lib/ontology/processJob"
    );
    await processOntologyExtraction(supabase, userId, documentId, profileId);
    await supabase
      .from("documents")
      .update({ ontology_status: "completed" })
      .eq("id", documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ontology extraction failed";
    console.error("Ontology extraction failed (non-blocking):", documentId, message);
    await supabase
      .from("documents")
      .update({
        ontology_status: "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", documentId);
  }

  return {
    diagnostics: recordDuration(
      diagnostics,
      "ontology_extraction_ms",
      ontologyStart
    ),
    deferredForOcr: false,
  };
}

async function runSemanticJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<ProcessingDiagnostics> {
  const start = Date.now();
  await supabase
    .from("documents")
    .update({
      semantic_status: "processing",
      processing_step: "semantic",
    })
    .eq("id", documentId);

  try {
    const { processSemanticExtraction } = await import(
      "@/lib/semantic/processJob"
    );
    const result = await processSemanticExtraction(
      supabase,
      userId,
      documentId,
      profileId
    );
    await supabase
      .from("documents")
      .update({
        semantic_status: result.skipped ? "skipped" : "completed",
      })
      .eq("id", documentId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Semantic extraction failed";
    console.error(
      "Semantic extraction failed (non-blocking):",
      documentId,
      message
    );
    await supabase
      .from("documents")
      .update({
        semantic_status: "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", documentId);
  }

  return recordDuration(diagnostics, "semantic_extraction_ms", start);
}

async function runGuardianItemsJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string,
  diagnostics: ProcessingDiagnostics
): Promise<ProcessingDiagnostics> {
  const start = Date.now();
  await supabase
    .from("documents")
    .update({
      guardian_items_status: "processing",
      processing_step: "guardian_items",
    })
    .eq("id", documentId);

  try {
    const { processGuardianItemExtraction } = await import(
      "@/lib/guardian-items/processJob"
    );
    const result = await processGuardianItemExtraction(
      supabase,
      userId,
      documentId,
      profileId
    );
    await supabase
      .from("documents")
      .update({
        guardian_items_status: result.skipped ? "skipped" : "completed",
      })
      .eq("id", documentId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Guardian item extraction failed";
    console.error(
      "Guardian item extraction failed (non-blocking):",
      documentId,
      message
    );
    await supabase
      .from("documents")
      .update({
        guardian_items_status: "failed",
        last_processing_error: message.slice(0, 500),
      })
      .eq("id", documentId);
  }

  return recordDuration(diagnostics, "guardian_items_extraction_ms", start);
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

  const { data: claimed } = await supabase
    .from("document_processing_jobs")
    .update({
      status: "processing",
      attempts: (job.attempts ?? 0) + 1,
      processing_started_at: now,
      updated_at: now,
    })
    .eq("id", job.id)
    .in("status", ["pending", "retryable"])
    .select("id")
    .maybeSingle();

  // Another worker already claimed this job.
  if (!claimed) return;

  try {
    let deferredForOcr = false;
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
    } else if (job.job_type === "extract_ontology") {
      const ontologyResult = await runOntologyJob(
        supabase,
        user.id,
        job.document_id,
        job.profile_id,
        diagnostics
      );
      diagnostics = ontologyResult.diagnostics;
      deferredForOcr = ontologyResult.deferredForOcr;
    } else if (job.job_type === "extract_semantic") {
      diagnostics = await runSemanticJob(
        supabase,
        user.id,
        job.document_id,
        job.profile_id,
        diagnostics
      );
    } else if (job.job_type === "extract_guardian_items") {
      diagnostics = await runGuardianItemsJob(
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

    if (deferredForOcr) {
      // Keep ontology job retryable until OCR finishes and re-chains with force.
      await supabase
        .from("document_processing_jobs")
        .update({
          status: "retryable",
          last_error: "Waiting for document OCR/analysis before ontology",
          error_category: "deferred_ocr",
          next_retry_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
          diagnostics,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      await persistDocumentProcessingDiagnostics(
        supabase,
        job.document_id,
        diagnostics
      );
      return;
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

    await persistDocumentProcessingDiagnostics(
      supabase,
      job.document_id,
      diagnostics
    );

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
  options: {
    limit?: number;
    profileId?: string;
    documentId?: string;
    jobTypes?: ProcessingJobType[];
  } = {}
): Promise<{ processed: number; failed: number }> {
  await recoverStaleProcessingJobs(supabase);

  const maxJobs = options.limit ?? processingConcurrencyLimit();
  const now = new Date().toISOString();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxJobs; i += 1) {
    let query = supabase
      .from("document_processing_jobs")
      .select("id, document_id, profile_id, job_type, attempts, status")
      .eq("user_id", userId)
      .in("status", ["pending", "retryable"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order("created_at", { ascending: true })
      .limit(1);

    if (options.profileId) {
      query = query.eq("profile_id", options.profileId);
    }
    if (options.documentId) {
      query = query.eq("document_id", options.documentId);
    }
    if (options.jobTypes?.length) {
      query = query.in("job_type", options.jobTypes);
    }

    const { data: jobs } = await query;
    const job = jobs?.[0];
    if (!job) break;

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

  return { processed, failed };
}

export async function processPendingDocumentJobsAdmin(
  supabase: SupabaseClient,
  options: {
    limit?: number;
    jobTypes?: ProcessingJobType[];
    userId?: string;
  } = {}
): Promise<{ processed: number; failed: number; recovered: number }> {
  await recoverStaleProcessingJobs(supabase);
  const limit = options.limit ?? processingConcurrencyLimit() * 2;

  let query = supabase
    .from("document_processing_jobs")
    .select("id, document_id, profile_id, user_id, job_type, attempts, status")
    .in("status", ["pending", "retryable"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.jobTypes?.length) {
    query = query.in("job_type", options.jobTypes);
  }
  if (options.userId) {
    query = query.eq("user_id", options.userId);
  }

  const { data: jobs } = await query;

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
  } else if (stage === "extract_ontology") {
    await supabase
      .from("documents")
      .update({ ontology_status: "pending", last_processing_error: null })
      .eq("id", args.documentId);
  } else if (stage === "extract_semantic") {
    await supabase
      .from("documents")
      .update({ semantic_status: "pending", last_processing_error: null })
      .eq("id", args.documentId);
  } else if (stage === "extract_guardian_items") {
    await supabase
      .from("documents")
      .update({
        guardian_items_status: "pending",
        last_processing_error: null,
      })
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
