/** Stage timing diagnostics for document processing (no document content). */

export type ProcessingTimingKey =
  | "storage_upload_ms"
  | "db_insert_ms"
  | "queue_create_ms"
  | "text_extraction_ms"
  | "ocr_ms"
  | "llm_analysis_ms"
  | "organization_ms"
  | "chunking_ms"
  | "embedding_ms"
  | "ontology_extraction_ms"
  | "semantic_extraction_ms"
  | "guardian_items_extraction_ms"
  | "knowledge_extraction_ms"
  | "total_to_searchable_ms"
  | "total_to_knowledge_ready_ms";

export type ProcessingDiagnostics = Partial<
  Record<ProcessingTimingKey, number>
> & {
  recorded_at?: string;
};

export function createDiagnostics(): ProcessingDiagnostics {
  return { recorded_at: new Date().toISOString() };
}

export function mergeDiagnostics(
  base: ProcessingDiagnostics | null | undefined,
  patch: ProcessingDiagnostics
): ProcessingDiagnostics {
  return { ...base, ...patch, recorded_at: new Date().toISOString() };
}

export function recordDuration(
  diagnostics: ProcessingDiagnostics,
  key: ProcessingTimingKey,
  startedAt: number
): ProcessingDiagnostics {
  return mergeDiagnostics(diagnostics, {
    [key]: Math.max(0, Date.now() - startedAt),
  });
}

export function isProcessingDiagnosticsEnabled(): boolean {
  if (process.env.GUARDIAN_PROCESSING_DIAGNOSTICS === "true") return true;
  return process.env.NODE_ENV === "development";
}

export function logProcessingDiagnostics(
  documentId: string,
  stage: string,
  diagnostics: ProcessingDiagnostics
): void {
  if (!isProcessingDiagnosticsEnabled()) return;
  console.info(
    "document_processing_diagnostics",
    JSON.stringify({ documentId, stage, ...diagnostics })
  );
}
