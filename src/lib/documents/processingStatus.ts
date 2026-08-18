/** User-facing document processing stages and readiness levels. */

import type { AnalysisStatus } from "@/lib/analysis/types";

export type IndexingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable"
  | "skipped";

export type OntologyStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable"
  | "skipped";

export type KnowledgeStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retryable"
  | "skipped";

export type DocumentProcessingStage =
  | "uploading"
  | "uploaded"
  | "queued"
  | "analyzing"
  | "indexing"
  | "knowledge_processing"
  | "ready"
  | "failed"
  | "retryable";

export type DocumentReadiness = "uploaded" | "searchable" | "knowledge_ready";

const IN_PROGRESS_ANALYSIS: AnalysisStatus[] = [
  "extracting",
  "classifying",
  "analyzing",
  "validating",
];

export const PROCESSING_STAGE_LABELS: Record<DocumentProcessingStage, string> = {
  uploading: "Uploading…",
  uploaded: "Upload complete",
  queued: "Waiting for analysis",
  analyzing: "Reading document",
  indexing: "Making document searchable",
  knowledge_processing: "Building connected knowledge",
  ready: "Ready to ask Gideon",
  failed: "Processing failed",
  retryable: "Processing paused — tap Retry",
};

export const PROCESSING_STEP_LABELS: Record<string, string> = {
  queued: "Waiting for analysis",
  extracting: "Reading document",
  classifying: "Identifying document type",
  analyzing: "Extracting important information",
  validating: "Checking dates and amounts",
  indexing: "Making document searchable",
  ontology: "Extracting business entities",
  knowledge: "Building connected knowledge",
  ready: "Ready to ask Gideon",
};

export type DocumentProcessingFields = {
  analysis_status: string;
  indexing_status?: string | null;
  ontology_status?: string | null;
  knowledge_status?: string | null;
  processing_step?: string | null;
  last_processing_error?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
};

export function isAnalysisComplete(analysisStatus: string): boolean {
  return (
    analysisStatus === "completed" || analysisStatus === "needs_verification"
  );
}

/** Analysis + space matching done — safe to show filing UI without waiting for search indexing. */
export function isAnalysisReadyForFiling(analysisStatus: string): boolean {
  return isAnalysisComplete(analysisStatus);
}

export function isDocumentSearchable(doc: DocumentProcessingFields): boolean {
  const indexing = doc.indexing_status ?? "pending";
  return (
    isAnalysisComplete(doc.analysis_status) &&
    (indexing === "completed" || indexing === "skipped")
  );
}

export function isKnowledgeReady(doc: DocumentProcessingFields): boolean {
  return (
    isDocumentSearchable(doc) &&
    ["completed", "skipped"].includes(doc.knowledge_status ?? "pending")
  );
}

export function documentReadiness(
  doc: DocumentProcessingFields
): DocumentReadiness {
  if (isKnowledgeReady(doc)) return "knowledge_ready";
  if (isDocumentSearchable(doc)) return "searchable";
  return "uploaded";
}

export function deriveProcessingStage(
  doc: DocumentProcessingFields
): DocumentProcessingStage {
  const indexing = (doc.indexing_status ?? "pending") as IndexingStatus;
  const knowledge = (doc.knowledge_status ?? "pending") as KnowledgeStatus;
  const analysis = doc.analysis_status as AnalysisStatus;

  if (analysis === "failed" || indexing === "failed" || knowledge === "failed") {
    return "failed";
  }
  // Indexing pause blocks search. Knowledge-only pause must not hide a searchable doc.
  if (indexing === "retryable") {
    return "retryable";
  }

  if (isDocumentSearchable(doc)) {
    if (knowledge === "processing") return "knowledge_processing";
    return "ready";
  }

  if (knowledge === "retryable") {
    return "retryable";
  }

  if (indexing === "processing") return "indexing";
  if (IN_PROGRESS_ANALYSIS.includes(analysis)) return "analyzing";
  if (analysis === "queued") return "queued";

  if (isAnalysisComplete(analysis) && indexing === "pending") {
    return "indexing";
  }

  if (analysis === "uploaded" && doc.last_processing_error?.trim()) {
    return "retryable";
  }
  if (analysis === "uploaded") return "uploaded";
  return "uploaded";
}

export function isProcessingActive(stage: DocumentProcessingStage): boolean {
  return [
    "queued",
    "analyzing",
    "indexing",
    "knowledge_processing",
    "retryable",
  ].includes(stage);
}

export function processingProgressPercent(
  doc: DocumentProcessingFields
): number {
  const stage = deriveProcessingStage(doc);
  switch (stage) {
    case "uploaded":
      return 10;
    case "queued":
      return 15;
    case "analyzing":
      return 45;
    case "indexing":
      return 75;
    case "knowledge_processing":
      return 90;
    case "ready":
      return 100;
    case "failed":
    case "retryable":
      return 0;
    default:
      return 5;
  }
}

/** Maps a granular processing_step onto the coarser derived stage. */
const STEP_TO_STAGE: Record<string, DocumentProcessingStage> = {
  queued: "queued",
  extracting: "analyzing",
  classifying: "analyzing",
  analyzing: "analyzing",
  validating: "analyzing",
  indexing: "indexing",
  ontology: "knowledge_processing",
  knowledge: "knowledge_processing",
  ready: "ready",
};

export function userFacingStatusLabel(doc: DocumentProcessingFields): string {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const isImage =
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(doc.file_name ?? "");
  const stage = deriveProcessingStage(doc);
  if (isImage) {
    if (stage === "queued" || stage === "analyzing") return "Analyzing image...";
    if (stage === "failed" || stage === "retryable") return "Analysis failed";
    if (stage === "ready") return "Vision analyzed";
    if (stage === "uploaded") return "Uploaded";
  }
  const step = doc.processing_step;
  // Only use processing_step when it matches the current stage. A stale
  // "queued" step must not hide completed analysis as "Waiting for analysis".
  if (
    step &&
    PROCESSING_STEP_LABELS[step] &&
    STEP_TO_STAGE[step] === stage
  ) {
    return PROCESSING_STEP_LABELS[step]!;
  }
  return PROCESSING_STAGE_LABELS[stage];
}
