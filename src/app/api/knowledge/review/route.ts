import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const status = url.searchParams.get("status");

  let factQuery = supabase
    .from("guardian_knowledge_facts")
    .select(
      "id, subject_name, predicate, object_value, unit, confidence, review_status, source_document_id, source_excerpt, effective_date, expiration_date, profile_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) factQuery = factQuery.eq("profile_id", profileId);
  if (status) factQuery = factQuery.eq("review_status", status);

  const { data: facts, error: factErr } = await factQuery;
  if (factErr) {
    return NextResponse.json({ error: factErr.message }, { status: 500 });
  }

  let entityQuery = supabase
    .from("guardian_knowledge_entities")
    .select(
      "id, name, entity_type, confidence, review_status, source_document_id, profile_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) entityQuery = entityQuery.eq("profile_id", profileId);

  const { data: entities } = await entityQuery;

  const docIds = [
    ...new Set(
      [...(facts ?? []), ...(entities ?? [])]
        .map((r) => r.source_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const fileNames = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", docIds);
    for (const d of docs ?? []) fileNames.set(d.id, d.file_name);
  }

  return NextResponse.json({
    facts: (facts ?? []).map((f) => ({
      ...f,
      sourceFileName: f.source_document_id
        ? fileNames.get(f.source_document_id) ?? null
        : null,
    })),
    entities: entities ?? [],
  });
}

export async function PATCH(request: Request) {
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

  let body: {
    factId?: string;
    entityId?: string;
    action?: "confirm" | "reject" | "reprocess";
    documentId?: string;
    profileId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (body.action === "confirm" && body.factId) {
    await supabase
      .from("guardian_knowledge_facts")
      .update({
        review_status: "confirmed",
        last_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.factId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject" && body.factId) {
    await supabase
      .from("guardian_knowledge_facts")
      .update({
        review_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.factId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reprocess" && body.documentId && body.profileId) {
    const { enqueueKnowledgeExtractionJob } = await import(
      "@/lib/knowledge/v2/jobs"
    );
    await enqueueKnowledgeExtractionJob(supabase, {
      documentId: body.documentId,
      profileId: body.profileId,
      userId: user.id,
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  if (body.action === "confirm" && body.entityId) {
    await supabase
      .from("guardian_knowledge_entities")
      .update({
        review_status: "confirmed",
        last_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.entityId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
