import type {
  ProcessingDiagnostics,
  ProcessingTimingKey,
} from "./processingDiagnostics";
import type { DocumentProcessingFields } from "./processingStatus";
import {
  deriveProcessingStage,
  isProcessingActive,
} from "./processingStatus";

export type ProcessingJobType =
  | "analyze_document"
  | "index_document"
  | "extract_ontology"
  | "extract_knowledge";

export type ProcessingTraceStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ProcessingTraceStage = {
  id: ProcessingJobType;
  label: string;
  status: ProcessingTraceStageStatus;
  durationMs: number | null;
  timings: Partial<Record<ProcessingTimingKey, number>>;
};

export type ProcessingTrace = {
  elapsedMs: number | null;
  stages: ProcessingTraceStage[];
  slowestStageId: ProcessingJobType | null;
  diagnostics: ProcessingDiagnostics;
};

export const PROCESSING_TIMING_LABELS: Record<ProcessingTimingKey, string> = {
  storage_upload_ms: "File read",
  db_insert_ms: "Save record",
  queue_create_ms: "Queue",
  text_extraction_ms: "Text extraction",
  ocr_ms: "OCR",
  llm_analysis_ms: "AI analysis",
  organization_ms: "Space matching",
  chunking_ms: "Chunking",
  embedding_ms: "Search indexing",
  ontology_extraction_ms: "Ontology extraction",
  knowledge_extraction_ms: "Knowledge graph",
  total_to_searchable_ms: "Total to searchable",
  total_to_knowledge_ready_ms: "Total to knowledge ready",
};

const STAGE_ORDER: ProcessingJobType[] = [
  "analyze_document",
  "index_document",
  "extract_ontology",
  "extract_knowledge",
];

const STAGE_LABELS: Record<ProcessingJobType, string> = {
  analyze_document: "Reading & analyzing",
  index_document: "Making searchable",
  extract_ontology: "Extracting entities",
  extract_knowledge: "Building knowledge",
};

type TraceJobRow = {
  job_type: string;
  status: string;
  diagnostics: ProcessingDiagnostics | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
};

function jobDurationMs(job: TraceJobRow, now = Date.now()): number | null {
  if (!job.processing_started_at) return null;
  const start = Date.parse(job.processing_started_at);
  if (!Number.isFinite(start)) return null;
  if (job.processing_completed_at) {
    const end = Date.parse(job.processing_completed_at);
    if (Number.isFinite(end)) return Math.max(0, end - start);
  }
  if (job.status === "processing") {
    return Math.max(0, now - start);
  }
  return null;
}

function mapJobStatus(
  job: TraceJobRow | undefined,
  doc: DocumentProcessingFields,
  stageId: ProcessingJobType
): ProcessingTraceStageStatus {
  if (!job) {
    const current = deriveProcessingStage(doc);
    if (!isProcessingActive(current)) {
      if (stageId === "analyze_document") {
        return doc.analysis_status === "failed" ? "failed" : "skipped";
      }
      if (stageId === "index_document") {
        const indexing = doc.indexing_status ?? "pending";
        if (indexing === "skipped") return "skipped";
        if (indexing === "failed") return "failed";
      }
      if (stageId === "extract_ontology") {
        const ontology = doc.ontology_status ?? "pending";
        if (ontology === "skipped") return "skipped";
        if (ontology === "failed") return "failed";
      }
      if (stageId === "extract_knowledge") {
        const knowledge = doc.knowledge_status ?? "pending";
        if (knowledge === "skipped") return "skipped";
        if (knowledge === "failed") return "failed";
      }
    }
    return "pending";
  }

  if (job.status === "completed") return "completed";
  if (job.status === "failed") return "failed";
  if (job.status === "processing") return "running";
  if (job.status === "pending" || job.status === "retryable") {
    return job.status === "retryable" ? "pending" : "pending";
  }
  return "pending";
}

export function buildProcessingTrace(args: {
  doc: DocumentProcessingFields & {
    processing_started_at?: string | null;
    processing_completed_at?: string | null;
    indexing_status?: string | null;
    ontology_status?: string | null;
    knowledge_status?: string | null;
    analysis_status?: string;
  };
  jobs: TraceJobRow[];
  documentDiagnostics?: ProcessingDiagnostics | null;
  now?: number;
}): ProcessingTrace {
  const now = args.now ?? Date.now();
  const jobsByType = new Map<string, TraceJobRow>();
  for (const job of args.jobs) {
    const existing = jobsByType.get(job.job_type);
    if (!existing || job.created_at >= existing.created_at) {
      jobsByType.set(job.job_type, job);
    }
  }

  const mergedDiagnostics = { ...(args.documentDiagnostics ?? {}) };
  for (const job of jobsByType.values()) {
    Object.assign(mergedDiagnostics, job.diagnostics ?? {});
  }

  const stages: ProcessingTraceStage[] = STAGE_ORDER.map((id) => {
    const job = jobsByType.get(id);
    let status = mapJobStatus(job, args.doc, id);

    if (id === "index_document" && (args.doc.indexing_status ?? "") === "skipped") {
      status = "skipped";
    }
    if (
      id === "extract_ontology" &&
      (args.doc.ontology_status ?? "") === "skipped"
    ) {
      status = "skipped";
    }
    if (
      id === "extract_knowledge" &&
      (args.doc.knowledge_status ?? "") === "skipped"
    ) {
      status = "skipped";
    }

    return {
      id,
      label: STAGE_LABELS[id],
      status,
      durationMs: job ? jobDurationMs(job, now) : null,
      timings: job?.diagnostics ?? {},
    };
  });

  const elapsedMs = args.doc.processing_started_at
    ? Math.max(0, now - Date.parse(args.doc.processing_started_at))
    : null;

  const completedStages = stages.filter(
    (s) => s.status === "completed" && s.durationMs != null
  );
  const slowestStageId =
    completedStages.length === 0
      ? null
      : completedStages.reduce((a, b) =>
          (a.durationMs ?? 0) >= (b.durationMs ?? 0) ? a : b
        ).id;

  return {
    elapsedMs: Number.isFinite(elapsedMs ?? NaN) ? elapsedMs : null,
    stages,
    slowestStageId,
    diagnostics: mergedDiagnostics,
  };
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export function topTimingBreakdown(
  diagnostics: ProcessingDiagnostics,
  limit = 4
): { key: ProcessingTimingKey; label: string; ms: number }[] {
  const entries = (
    Object.entries(diagnostics) as [ProcessingTimingKey, number | undefined][]
  )
    .filter(
      ([key, value]) =>
        key in PROCESSING_TIMING_LABELS &&
        typeof value === "number" &&
        value > 0 &&
        !key.startsWith("total_")
    )
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return entries.slice(0, limit).map(([key, ms]) => ({
    key,
    label: PROCESSING_TIMING_LABELS[key],
    ms: ms ?? 0,
  }));
}
