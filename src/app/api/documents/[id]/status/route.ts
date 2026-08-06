import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deriveProcessingStage,
  documentReadiness,
  isDocumentSearchable,
  isProcessingActive,
  processingProgressPercent,
  userFacingStatusLabel,
} from "@/lib/documents/processingStatus";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "id, file_name, analysis_status, indexing_status, knowledge_status, processing_step, processing_progress, last_processing_error, processing_started_at, processing_completed_at, profile_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data: job } = await supabase
    .from("document_processing_jobs")
    .select("id, job_type, status, last_error")
    .eq("document_id", id)
    .in("status", ["pending", "processing", "retryable"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select("summary, facts, model, title, document_type")
    .eq("document_id", id)
    .maybeSingle();

  const stage = deriveProcessingStage(doc);
  const active = isProcessingActive(stage);

  return NextResponse.json({
    documentId: doc.id,
    fileName: doc.file_name,
    analysisStatus: doc.analysis_status,
    indexingStatus: doc.indexing_status,
    knowledgeStatus: doc.knowledge_status,
    processingStage: stage,
    processingLabel: userFacingStatusLabel(doc),
    processingProgress:
      doc.processing_progress ?? processingProgressPercent(doc),
    readiness: documentReadiness(doc),
    searchable: isDocumentSearchable(doc),
    active,
    lastError: doc.last_processing_error,
    jobId: job?.id ?? null,
    jobType: job?.job_type ?? null,
    jobStatus: job?.status ?? null,
    processingStartedAt: doc.processing_started_at,
    processingCompletedAt: doc.processing_completed_at,
    summary: extracted?.summary ?? null,
    facts: extracted?.facts ?? null,
    model: extracted?.model ?? null,
    title: extracted?.title ?? null,
    documentType: extracted?.document_type ?? null,
  });
}
