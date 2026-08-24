import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildKnowledgeHealth } from "@/lib/personal-space/knowledgeHealth";
import { categoryForEntityKind } from "@/lib/personal-space/categories";
import type {
  PersonalEntity,
  PersonalFact,
  PersonalKnowledgeCategory,
  PersonalRelationship,
} from "@/lib/personal-space/types";

export const runtime = "nodejs";

function mapEntityType(t: string): PersonalEntity["kind"] {
  if (t === "person") return "person";
  if (t === "organization") return "organization";
  if (t === "vehicle") return "vehicle";
  if (t === "event") return "event";
  if (t === "task") return "task";
  if (t === "document") return "document";
  if (t === "location") return "location";
  if (t === "asset") return "asset";
  return "other";
}

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
  if (!profileId) {
    return NextResponse.json({ error: "profileId required." }, { status: 400 });
  }

  const [
    { data: entities },
    { data: facts },
    { data: relationships },
    { count: documentCount },
  ] = await Promise.all([
    supabase
      .from("guardian_knowledge_entities")
      .select(
        "id, name, entity_type, confidence, review_status, source_document_id, profile_id"
      )
      .eq("profile_id", profileId)
      .neq("review_status", "rejected")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("guardian_knowledge_facts")
      .select(
        "id, subject_name, predicate, object_value, confidence, review_status, source_document_id, source_excerpt, profile_id"
      )
      .eq("profile_id", profileId)
      .neq("review_status", "rejected")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("guardian_knowledge_relationships")
      .select(
        "id, subject, relationship, object, confidence, profile_id"
      )
      .eq("profile_id", profileId)
      .limit(200),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId),
  ]);

  const docIds = [
    ...new Set(
      [...(entities ?? []), ...(facts ?? [])]
        .map((r) => r.source_document_id as string | null)
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

  const storeEntities: PersonalEntity[] = (entities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    kind: mapEntityType(String(e.entity_type)),
    confidence: Number(e.confidence ?? 0.8),
    confidenceLevel: "high",
    status:
      e.review_status === "confirmed"
        ? "confirmed"
        : e.review_status === "suggested"
          ? "provisional"
          : "confirmed",
  }));

  const storeFacts: PersonalFact[] = (facts ?? []).map((f) => ({
    id: f.id,
    subject: f.subject_name,
    predicate: f.predicate,
    value: f.object_value,
    object: f.object_value,
    confidence: Number(f.confidence ?? 0.8),
    confidenceLevel: "high",
    status:
      f.review_status === "suggested" ? "provisional" : "confirmed",
    sourceDocumentId: f.source_document_id,
    sourceFileName: f.source_document_id
      ? fileNames.get(f.source_document_id) ?? null
      : null,
    sourceExcerpt: f.source_excerpt,
  }));

  const storeRels: PersonalRelationship[] = (relationships ?? []).map((r) => ({
    id: r.id,
    subject: r.subject,
    predicate: r.relationship,
    object: r.object,
    confidence: Number(r.confidence ?? 0.8),
    confidenceLevel: "high",
    status: "confirmed",
  }));

  const health = buildKnowledgeHealth({
    store: {
      entities: storeEntities,
      facts: storeFacts,
      relationships: storeRels,
    },
    documentCount: documentCount ?? 0,
  });

  const items = [
    ...storeEntities.map((e) => ({
      id: e.id!,
      kind: "entity" as const,
      title: e.name,
      subtitle: e.kind,
      category: categoryForEntityKind(e.kind) as PersonalKnowledgeCategory,
      status: e.status,
      sourceFileName: null as string | null,
      sourceDocumentId: null as string | null,
    })),
    ...storeFacts.map((f) => ({
      id: f.id!,
      kind: "fact" as const,
      title: `${f.subject} — ${f.predicate}${f.value ? `: ${f.value}` : ""}`,
      subtitle: f.sourceExcerpt ?? undefined,
      category: (f.category ?? "other") as PersonalKnowledgeCategory,
      status: f.status,
      sourceFileName: f.sourceFileName ?? null,
      sourceDocumentId: f.sourceDocumentId ?? null,
    })),
    ...storeRels.map((r) => ({
      id: r.id!,
      kind: "relationship" as const,
      title: `${r.subject} → ${r.predicate} → ${r.object}`,
      category: "relationships" as PersonalKnowledgeCategory,
      status: r.status,
      sourceFileName: null as string | null,
      sourceDocumentId: null as string | null,
    })),
  ];

  // Progressive reveal: only categories with content
  const visibleSet = new Set(health.visibleCategories);
  if (storeRels.length) visibleSet.add("relationships");

  return NextResponse.json({
    ...health,
    visibleCategories: [...visibleSet],
    items: items.filter((i) => visibleSet.has(i.category) || i.category === "other"),
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

  const body = (await request.json()) as {
    profileId?: string;
    id?: string;
    kind?: string;
    action?: string;
    value?: string;
  };

  if (!body.id || !body.kind) {
    return NextResponse.json({ error: "id and kind required." }, { status: 400 });
  }

  if (body.kind === "fact" && body.action === "correct" && body.value) {
    const { error } = await supabase
      .from("guardian_knowledge_facts")
      .update({
        object_value: body.value,
        review_status: "confirmed",
        confidence: 0.98,
      })
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "entity" && body.action === "correct" && body.value) {
    const { error } = await supabase
      .from("guardian_knowledge_entities")
      .update({ name: body.value, review_status: "confirmed" })
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
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

  const body = (await request.json()) as {
    id?: string;
    kind?: string;
  };
  if (!body.id || !body.kind) {
    return NextResponse.json({ error: "id and kind required." }, { status: 400 });
  }

  const table =
    body.kind === "entity"
      ? "guardian_knowledge_entities"
      : body.kind === "relationship"
        ? "guardian_knowledge_relationships"
        : "guardian_knowledge_facts";

  const { error } = await supabase
    .from(table)
    .update({ review_status: "rejected" })
    .eq("id", body.id);

  if (error) {
    // Relationships table may not have review_status — fall back to delete
    const { error: delErr } = await supabase.from(table).delete().eq("id", body.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
