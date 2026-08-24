import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalKnowledgeStore } from "./types";

/** Load a Personal Space knowledge store from the knowledge engine tables. */
export async function loadPersonalKnowledgeStore(
  supabase: SupabaseClient,
  profileId: string
): Promise<PersonalKnowledgeStore> {
  const [{ data: entities }, { data: facts }, { data: relationships }] =
    await Promise.all([
      supabase
        .from("guardian_knowledge_entities")
        .select("id, name, entity_type, confidence, review_status")
        .eq("profile_id", profileId)
        .neq("review_status", "rejected")
        .limit(100),
      supabase
        .from("guardian_knowledge_facts")
        .select(
          "id, subject_name, predicate, object_value, confidence, review_status, source_document_id, source_excerpt"
        )
        .eq("profile_id", profileId)
        .neq("review_status", "rejected")
        .limit(100),
      supabase
        .from("guardian_knowledge_relationships")
        .select("id, subject, relationship, object, confidence")
        .eq("profile_id", profileId)
        .limit(100),
    ]);

  const docIds = [
    ...new Set(
      (facts ?? [])
        .map((f) => f.source_document_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const fileNames = new Map<string, string>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", docIds);
    for (const d of docs ?? []) fileNames.set(d.id, d.file_name);
  }

  return {
    entities: (entities ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      kind:
        e.entity_type === "person" ||
        e.entity_type === "organization" ||
        e.entity_type === "vehicle" ||
        e.entity_type === "event" ||
        e.entity_type === "task" ||
        e.entity_type === "document" ||
        e.entity_type === "location" ||
        e.entity_type === "asset"
          ? e.entity_type
          : "other",
      confidence: Number(e.confidence ?? 0.8),
      confidenceLevel: "high" as const,
      status:
        e.review_status === "suggested"
          ? ("provisional" as const)
          : ("confirmed" as const),
    })),
    facts: (facts ?? []).map((f) => ({
      id: f.id,
      subject: f.subject_name,
      predicate: f.predicate,
      value: f.object_value,
      object: f.object_value,
      confidence: Number(f.confidence ?? 0.8),
      confidenceLevel: "high" as const,
      status:
        f.review_status === "suggested"
          ? ("provisional" as const)
          : ("confirmed" as const),
      sourceExcerpt: f.source_excerpt,
      sourceDocumentId: f.source_document_id,
      sourceFileName: f.source_document_id
        ? fileNames.get(f.source_document_id) ?? null
        : null,
    })),
    relationships: (relationships ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      predicate: r.relationship,
      object: r.object,
      confidence: Number(r.confidence ?? 0.8),
      confidenceLevel: "high" as const,
      status: "confirmed" as const,
    })),
  };
}
