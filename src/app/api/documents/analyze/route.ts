import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertBillingQuota } from "@/lib/billing/quota";
import { isCsvMimeOrName } from "@/lib/analysis/csvText";
import { isJsonMimeOrName } from "@/lib/analysis/jsonText";
import {
  deriveProcessingStage,
  documentReadiness,
  processingProgressPercent,
  userFacingStatusLabel,
} from "@/lib/documents/processingStatus";
import {
  enqueueAnalyzePipeline,
  enqueueDocumentProcessingJob,
  processDocumentProcessingJob,
} from "@/lib/documents/processingJobs";

export const runtime = "nodejs";
/** JSON / CSV / Trello runs sync in this request; needs headroom past compact + one Claude call. */
export const maxDuration = 120;

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
      "id, file_name, mime_type, size_bytes, profile_id, analysis_status, indexing_status, knowledge_status, processing_step"
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

  // Large JSON/CSV/Trello exports hang in the background worker — run them inline.
  const runSync =
    sync ||
    isJsonMimeOrName(doc.mime_type, doc.file_name) ||
    isCsvMimeOrName(doc.mime_type, doc.file_name);

  if (runSync) {
    await supabase
      .from("documents")
      .update({
        analysis_status: "queued",
        processing_step: "queued",
        processing_started_at: new Date().toISOString(),
        last_processing_error: null,
      })
      .eq("id", documentId);

    await enqueueDocumentProcessingJob(supabase, {
      documentId,
      profileId: doc.profile_id,
      userId: user.id,
      jobType: "analyze_document",
      force: true,
    });

    const { data: freshJob } = await supabase
      .from("document_processing_jobs")
      .select("id, document_id, profile_id, job_type, attempts")
      .eq("document_id", documentId)
      .eq("job_type", "analyze_document")
      .single();

    if (!freshJob) {
      return NextResponse.json(
        { error: "Analysis couldn't be scheduled. Please try again." },
        { status: 500 }
      );
    }

    try {
      await processDocumentProcessingJob(supabase, user, {
        id: freshJob.id,
        document_id: freshJob.document_id,
        profile_id: freshJob.profile_id,
        job_type: "analyze_document",
        attempts: freshJob.attempts ?? 0,
      });

      // Finish indexing in the same request so CSV/JSON don't stall on "paused"
      // after analysis while a background worker never picks up the next stage.
      for (let i = 0; i < 3; i += 1) {
        const { data: nextJobs } = await supabase
          .from("document_processing_jobs")
          .select("id, document_id, profile_id, job_type, attempts")
          .eq("document_id", documentId)
          .in("status", ["pending", "retryable"])
          .in("job_type", [
            "index_document",
            "extract_ontology",
            "extract_knowledge",
          ])
          .order("created_at", { ascending: true })
          .limit(1);
        const next = nextJobs?.[0];
        if (!next) break;
        try {
          await processDocumentProcessingJob(supabase, user, {
            id: next.id,
            document_id: next.document_id,
            profile_id: next.profile_id,
            job_type: next.job_type as
              | "index_document"
              | "extract_ontology"
              | "extract_knowledge",
            attempts: next.attempts ?? 0,
          });
        } catch {
          // Leave remaining stages for background workers / Retry.
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed.";
      return NextResponse.json({ error: message, sync: true }, { status: 500 });
    }

    const { data: extracted } = await supabase
      .from("extracted_data")
      .select("summary, facts, model, title, document_type")
      .eq("document_id", documentId)
      .maybeSingle();

    const { data: updated } = await supabase
      .from("documents")
      .select(
        "analysis_status, indexing_status, knowledge_status, processing_step"
      )
      .eq("id", documentId)
      .single();

    const stage = deriveProcessingStage({
      analysis_status: updated?.analysis_status ?? "completed",
      indexing_status: updated?.indexing_status,
      knowledge_status: updated?.knowledge_status,
      processing_step: updated?.processing_step,
    });

    return NextResponse.json({
      queued: false,
      sync: true,
      documentId: doc.id,
      fileName: doc.file_name,
      summary: extracted?.summary ?? "",
      facts: extracted?.facts ?? [],
      model: extracted?.model ?? null,
      title: extracted?.title ?? null,
      documentType: extracted?.document_type ?? null,
      analysisStatus: updated?.analysis_status ?? "completed",
      processingStage: stage,
      processingLabel: userFacingStatusLabel({
        analysis_status: updated?.analysis_status ?? "completed",
        indexing_status: updated?.indexing_status,
        knowledge_status: updated?.knowledge_status,
        processing_step: updated?.processing_step,
      }),
      processingProgress: processingProgressPercent({
        analysis_status: updated?.analysis_status ?? "completed",
        indexing_status: updated?.indexing_status,
        knowledge_status: updated?.knowledge_status,
      }),
      readiness: documentReadiness({
        analysis_status: updated?.analysis_status ?? "completed",
        indexing_status: updated?.indexing_status,
        knowledge_status: updated?.knowledge_status,
      }),
    });
  }

  const { jobId } = await enqueueAnalyzePipeline(supabase, {
    documentId,
    profileId: doc.profile_id,
    userId: user.id,
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
