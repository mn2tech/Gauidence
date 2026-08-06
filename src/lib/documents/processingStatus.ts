/** User-facing document processing stages and readiness levels. */

import type { AnalysisStatus } from "@/lib/analysis/types";

export type IndexingStatus =
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
  knowledge: "Building connected knowledge",
  ready: "Ready to ask Gideon",
};

export type DocumentProcessingFields = {
  analysis_status: string;
  indexing_status?: string | null;
  knowledge_status?: string | null;
  processing_step?: string | null;
};

export function isAnalysisComplete(analysisStatus: string): boolean {
  return (
    analysisStatus === "completed" || analysisStatus === "needs_verification"
  );
}

export function isDocumentSearchable(doc: DocumentProcessingFields): boolean {
  return (
    isAnalysisComplete(doc.analysis_status) &&
    (doc.indexing_status ?? "pending") === "completed"
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
  if (indexing === "retryable" || knowledge === "retryable") {
    return "retryable";
  }

  if (isDocumentSearchable(doc)) {
    if (knowledge === "processing") return "knowledge_processing";
    return "ready";
  }

  if (indexing === "processing") return "indexing";
  if (IN_PROGRESS_ANALYSIS.includes(analysis)) return "analyzing";
  if (analysis === "queued") return "queued";

  if (isAnalysisComplete(analysis) && indexing === "pending") {
    return "indexing";
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

export function userFacingStatusLabel(doc: DocumentProcessingFields): string {
  if (doc.processing_step && PROCESSING_STEP_LABELS[doc.processing_step]) {
    return PROCESSING_STEP_LABELS[doc.processing_step]!;
  }
  return PROCESSING_STAGE_LABELS[deriveProcessingStage(doc)];
}
