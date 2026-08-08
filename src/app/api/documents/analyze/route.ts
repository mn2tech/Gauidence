import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertBillingQuota } from "@/lib/billing/quota";
import {
  deriveProcessingStage,
  documentReadiness,
  processingProgressPercent,
  userFacingStatusLabel,
} from "@/lib/documents/processingStatus";
import {
  enqueueAnalyzePipeline,
  processPendingDocumentJobs,
} from "@/lib/documents/processingJobs";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_ANALYZE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI analysis isn't set up yet on this deployment. The site owner needs to add an Anthropic (Claude) API key.",
      },
      { status: 503 }
    );
  }

  let documentId: string | undefined;
  let sync = false;
  try {
    const body = await request.json();
    documentId = body.documentId;
    sync = body.sync === true;
  } catch {
    // fall through
  }

  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, file_name, size_bytes, profile_id, analysis_status, indexing_status, knowledge_status, processing_step"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.size_bytes > MAX_ANALYZE_BYTES) {
    return NextResponse.json(
      { error: "This document is too large to analyze." },
      { status: 413 }
    );
  }

  const quota = await assertBillingQuota(supabase, user.id, "analyze", user.email);
  if (!quota.ok) return quota.response;

  if (sync) {
    const { processDocumentProcessingJob } = await import(
      "@/lib/documents/processingJobs"
    );
    const { enqueueDocumentProcessingJob } = await import(
      "@/lib/documents/processingJobs"
    );
    const { data: job } = await supabase
      .from("document_processing_jobs")
      .select("id, document_id, profile_id, job_type, attempts")
      .eq("document_id", documentId)
      .eq("job_type", "analyze_document")
      .maybeSingle();

    if (!job) {
      await enqueueDocumentProcessingJob(supabase, {
        documentId,
        profileId: doc.profile_id,
        userId: user.id,
        jobType: "analyze_document",
        force: true,
      });
    }

    const { data: freshJob } = await supabase
      .from("document_processing_jobs")
      .select("id, document_id, profile_id, job_type, attempts")
      .eq("document_id", documentId)
      .eq("job_type", "analyze_document")
      .single();

    await processDocumentProcessingJob(supabase, user, {
      id: freshJob!.id,
      document_id: freshJob!.document_id,
      profile_id: freshJob!.profile_id,
      job_type: "analyze_document",
      attempts: freshJob!.attempts ?? 0,
    });

    const { data: extracted } = await supabase
      .from("extracted_data")
      .select("summary, facts, model, title, document_type")
      .eq("document_id", documentId)
      .maybeSingle();

    const { data: updated } = await supabase
      .from("documents")
      .select("analysis_status")
      .eq("id", documentId)
      .single();

    return NextResponse.json({
      summary: extracted?.summary ?? "",
      facts: extracted?.facts ?? [],
      model: extracted?.model ?? null,
      title: extracted?.title ?? null,
      documentType: extracted?.document_type ?? null,
      analysisStatus: updated?.analysis_status ?? "completed",
      sync: true,
    });
  }

  const { jobId } = await enqueueAnalyzePipeline(supabase, {
    documentId,
    profileId: doc.profile_id,
    userId: user.id,
  });

  void processPendingDocumentJobs(supabase, user.id, {
    limit: 3,
    profileId: doc.profile_id,
  }).catch((err) => {
    console.error(
      "Document processing drain failed:",
      err instanceof Error ? err.message : "error"
    );
  });

  const stage = deriveProcessingStage({
    analysis_status: "queued",
    indexing_status: doc.indexing_status,
    knowledge_status: doc.knowledge_status,
  });

  return NextResponse.json({
    queued: true,
    documentId: doc.id,
    fileName: doc.file_name,
    uploadStatus: "uploaded",
    processingStage: stage,
    processingLabel: userFacingStatusLabel({
      analysis_status: "queued",
      processing_step: "queued",
    }),
    processingProgress: processingProgressPercent({
      analysis_status: "queued",
    }),
    readiness: documentReadiness({
      analysis_status: doc.analysis_status,
      indexing_status: doc.indexing_status,
      knowledge_status: doc.knowledge_status,
    }),
    jobId: jobId ?? null,
    analysisStatus: "queued",
  });
}
