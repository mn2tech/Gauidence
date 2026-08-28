import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  enqueueAnalyzePipeline,
  processPendingDocumentJobs,
  retryDocumentProcessing,
} from "@/lib/documents/processingJobs";

export const runtime = "nodejs";

const STUCK_THRESHOLD_MS = 20 * 60 * 1000;
const MAX_BATCH = 20;

type RetryMode =
  | "failed"
  | "uploaded"
  | "stuck"
  | "all"
  | "indexing"
  | "knowledge"
  | "guardian_items";

export async function POST(request: Request) {
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

  let body: { mode?: RetryMode; documentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = body.mode ?? "all";
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  let query = supabase
    .from("documents")
    .select(
      "id, file_name, analysis_status, indexing_status, knowledge_status, guardian_items_status, created_at, profile_id"
    );

  if (body.documentIds?.length) {
    query = query.in("id", body.documentIds);
  } else if (mode === "failed") {
    query = query.eq("analysis_status", "failed");
  } else if (mode === "uploaded") {
    query = query.eq("analysis_status", "uploaded");
  } else if (mode === "indexing") {
    query = query.in("indexing_status", ["failed", "retryable"]);
  } else if (mode === "knowledge") {
    query = query.in("knowledge_status", ["failed", "retryable"]);
  } else if (mode === "guardian_items") {
    query = query
      .in("analysis_status", ["completed", "needs_verification"])
      .in("guardian_items_status", ["pending", "failed", "retryable"]);
  } else if (mode === "stuck") {
    query = query
      .in("analysis_status", [
        "extracting",
        "classifying",
        "analyzing",
        "validating",
        "queued",
      ])
      .lt("processing_started_at", threshold);
  } else {
    query = query.or(
      "analysis_status.eq.failed,analysis_status.eq.uploaded,indexing_status.in.(failed,retryable),knowledge_status.in.(failed,retryable)"
    );
  }

  const { data: docs, error } = await query.limit(MAX_BATCH);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; fileName: string; stage: string }[] = [];

  for (const doc of docs ?? []) {
    let stage:
      | "analyze_document"
      | "index_document"
      | "extract_knowledge"
      | "extract_guardian_items" = "analyze_document";

    if (mode === "guardian_items") {
      stage = "extract_guardian_items";
    } else if (
      doc.analysis_status === "completed" ||
      doc.analysis_status === "needs_verification"
    ) {
      if (["failed", "retryable"].includes(doc.indexing_status ?? "")) {
        stage = "index_document";
      } else if (["failed", "retryable"].includes(doc.knowledge_status ?? "")) {
        stage = "extract_knowledge";
      } else if (
        ["pending", "failed", "retryable"].includes(
          doc.guardian_items_status ?? ""
        )
      ) {
        stage = "extract_guardian_items";
      } else if (doc.analysis_status === "uploaded") {
        stage = "analyze_document";
      } else {
        continue;
      }
    } else if (
      doc.analysis_status === "failed" ||
      doc.analysis_status === "uploaded" ||
      doc.analysis_status === "queued"
    ) {
      stage = "analyze_document";
    } else {
      stage = "analyze_document";
    }

    if (stage === "analyze_document" && doc.analysis_status === "uploaded") {
      await enqueueAnalyzePipeline(supabase, {
        documentId: doc.id,
        profileId: doc.profile_id,
        userId: user.id,
      });
    } else {
      await retryDocumentProcessing(supabase, {
        documentId: doc.id,
        profileId: doc.profile_id,
        userId: user.id,
        stage,
      });
    }

    results.push({
      id: doc.id,
      fileName: doc.file_name,
      stage,
    });
  }

  void processPendingDocumentJobs(supabase, user.id, { limit: 2 }).catch(
    (err) => {
      console.error(
        "Retry processing drain failed:",
        err instanceof Error ? err.message : "error"
      );
    }
  );

  return NextResponse.json({
    queued: results.length,
    documents: results,
  });
}
