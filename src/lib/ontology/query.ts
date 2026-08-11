import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityGraph, OntologyEntity } from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_EVIDENCE_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
} from "./types";

export async function getEntityGraph(
  supabase: SupabaseClient,
  entityId: string
): Promise<EntityGraph | null> {
  const { data: entity } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("id", entityId)
    .maybeSingle();

  if (!entity) return null;

  const typedEntity = entity as OntologyEntity;

  const [aliasesRes, outgoingRes, incomingRes] = await Promise.all([
    supabase
      .from("ontology_entity_aliases")
      .select("id, profile_id, entity_id, alias, normalized_alias, created_at")
      .eq("entity_id", entityId),
    supabase
      .from("ontology_relationships")
      .select(ONTOLOGY_RELATIONSHIP_SELECT)
      .eq("source_entity_id", entityId),
    supabase
      .from("ontology_relationships")
      .select(ONTOLOGY_RELATIONSHIP_SELECT)
      .eq("target_entity_id", entityId),
  ]);

  const outgoing = outgoingRes.data ?? [];
  const incoming = incomingRes.data ?? [];
  const connectedIds = new Set<string>();

  for (const rel of outgoing) {
    connectedIds.add(rel.target_entity_id);
  }
  for (const rel of incoming) {
    connectedIds.add(rel.source_entity_id);
  }
  connectedIds.delete(entityId);

  let connectedEntities: OntologyEntity[] = [];
  if (connectedIds.size) {
    const { data } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", [...connectedIds]);
    connectedEntities = (data as OntologyEntity[]) ?? [];
  }

  const entityMap = new Map(connectedEntities.map((e) => [e.id, e]));

  const relationshipIds = [
    ...outgoing.map((r) => r.id),
    ...incoming.map((r) => r.id),
  ];

  let evidenceQuery = supabase
    .from("ontology_evidence")
    .select(ONTOLOGY_EVIDENCE_SELECT)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (relationshipIds.length) {
    evidenceQuery = supabase
      .from("ontology_evidence")
      .select(ONTOLOGY_EVIDENCE_SELECT)
      .or(
        `entity_id.eq.${entityId},relationship_id.in.(${relationshipIds.join(",")})`
      )
      .order("created_at", { ascending: false })
      .limit(50);
  }

  const { data: evidenceRows } = await evidenceQuery;

  const documentIds = [
    ...new Set(
      (evidenceRows ?? [])
        .map((e) => e.document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const docNameMap = new Map<string, string>();
  if (documentIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", documentIds);
    for (const doc of docs ?? []) {
      docNameMap.set(doc.id, doc.file_name);
    }
  }

  const evidence = (evidenceRows ?? []).map((e) => ({
    ...e,
    documentName: e.document_id ? docNameMap.get(e.document_id) ?? null : null,
  }));

  return {
    entity: typedEntity,
    aliases: aliasesRes.data ?? [],
    outgoingRelationships: outgoing.map((rel) => ({
      ...rel,
      targetEntity: entityMap.get(rel.target_entity_id)!,
    })).filter((r) => r.targetEntity),
    incomingRelationships: incoming.map((rel) => ({
      ...rel,
      sourceEntity: entityMap.get(rel.source_entity_id)!,
    })).filter((r) => r.sourceEntity),
    connectedEntities,
    evidence,
  };
}

export async function getDocumentOntologySummary(
  supabase: SupabaseClient,
  documentId: string
): Promise<{
  status: string;
  entityCounts: Record<string, number>;
  relationshipCount: number;
}> {
  const { data: doc } = await supabase
    .from("documents")
    .select("ontology_status")
    .eq("id", documentId)
    .maybeSingle();

  const { data: entities } = await supabase
    .from("ontology_entities")
    .select("entity_type")
    .eq("source_id", documentId)
    .eq("source_type", "document");

  const entityCounts: Record<string, number> = {};
  for (const e of entities ?? []) {
    entityCounts[e.entity_type] = (entityCounts[e.entity_type] ?? 0) + 1;
  }

  const { count } = await supabase
    .from("ontology_relationships")
    .select("id", { count: "exact", head: true })
    .eq("source_document_id", documentId);

  return {
    status: doc?.ontology_status ?? "pending",
    entityCounts,
    relationshipCount: count ?? 0,
  };
}
