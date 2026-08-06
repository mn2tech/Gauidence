import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
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

  const [
    { count: documentCount },
    { count: chunkDocCount },
    { data: chunkRows },
    { count: entityCount },
    { count: factCount },
    { count: relationshipCount },
    { count: pendingJobs },
    { count: failedJobs },
    { count: suggestedFacts },
    { count: mergeSuggestions },
    { data: stuckAnalyzing },
    { data: uploadedDocs },
    { data: failedDocs },
  ] = await Promise.all([
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("document_chunks").select("document_id", { count: "exact", head: true }),
    supabase.from("document_chunks").select("document_id"),
    supabase.from("guardian_knowledge_entities").select("id", { count: "exact", head: true }),
    supabase.from("guardian_knowledge_facts").select("id", { count: "exact", head: true }),
    supabase.from("guardian_knowledge_relationships").select("id", { count: "exact", head: true }),
    supabase
      .from("guardian_knowledge_extraction_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retryable", "stale"]),
    supabase
      .from("guardian_knowledge_extraction_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("guardian_knowledge_facts")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "suggested"),
    supabase
      .from("guardian_knowledge_entity_merge_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("documents")
      .select("id, file_name, analysis_status, created_at")
      .eq("analysis_status", "analyzing"),
    supabase
      .from("documents")
      .select("id, file_name, analysis_status")
      .eq("analysis_status", "uploaded")
      .limit(20),
    supabase
      .from("documents")
      .select("id, file_name, analysis_status")
      .eq("analysis_status", "failed")
      .limit(20),
  ]);

  const chunked = new Set((chunkRows ?? []).map((r) => r.document_id));
  const { data: allDocs } = await supabase.from("documents").select("id");
  const notIndexed = (allDocs ?? []).filter((d) => !chunked.has(d.id)).length;

  const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const stuck = (stuckAnalyzing ?? []).filter(
    (d) => d.created_at && d.created_at < twentyMinutesAgo
  );

  const { data: graphProcessed } = await supabase
    .from("guardian_knowledge_extraction_jobs")
    .select("document_id")
    .eq("status", "completed");

  return NextResponse.json({
    documents: documentCount ?? 0,
    indexedDocuments: chunked.size,
    chunkRows: chunkDocCount ?? 0,
    graphProcessed: new Set((graphProcessed ?? []).map((r) => r.document_id)).size,
    pendingKnowledgeJobs: pendingJobs ?? 0,
    failedKnowledgeJobs: failedJobs ?? 0,
    entities: entityCount ?? 0,
    facts: factCount ?? 0,
    relationships: relationshipCount ?? 0,
    suggestedFacts: suggestedFacts ?? 0,
    mergeSuggestions: mergeSuggestions ?? 0,
    notIndexed,
    stuckAnalyzing: stuck.length,
    stuckAnalyzingDocs: stuck,
    uploadedNotAnalyzed: uploadedDocs ?? [],
    failedAnalysis: failedDocs ?? [],
  });
}
