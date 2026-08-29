import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "./normalize";
import type {
  SemanticEntity,
  SemanticEvidence,
  SemanticFact,
  SemanticRelationship,
} from "./types";
import {
  SEMANTIC_ENTITY_SELECT,
  SEMANTIC_FACT_SELECT,
  SEMANTIC_RELATIONSHIP_SELECT,
} from "./types";

export type ListSemanticEntitiesOptions = {
  type?: string;
  search?: string;
  limit?: number;
  spaceId?: string;
};

export async function listSemanticEntities(
  supabase: SupabaseClient,
  userId: string,
  options: ListSemanticEntitiesOptions = {}
): Promise<SemanticEntity[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  let query = supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options.type) {
    query = query.eq("entity_type", options.type);
  }

  if (options.search?.trim()) {
    const q = options.search.trim();
    const normalized = normalizeEntityName(q);
    query = query.or(
      `canonical_name.ilike.%${q}%,normalized_name.ilike.%${normalized}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let entities = (data ?? []) as SemanticEntity[];

  // Optional space filter via evidence provenance
  if (options.spaceId) {
    const { data: evidence } = await supabase
      .from("semantic_evidence")
      .select("id")
      .eq("user_id", userId)
      .eq("space_id", options.spaceId)
      .limit(500);

    const evidenceIds = (evidence ?? []).map((e) => e.id as string);
    if (evidenceIds.length === 0) return [];

    const { data: links } = await supabase
      .from("semantic_evidence_links")
      .select("semantic_object_id")
      .eq("user_id", userId)
      .eq("semantic_object_type", "entity")
      .in("evidence_id", evidenceIds);

    const allowed = new Set(
      (links ?? []).map((l) => l.semantic_object_id as string)
    );
    entities = entities.filter((e) => allowed.has(e.id));
  }

  return entities;
}

export async function getSemanticEntityDetail(
  supabase: SupabaseClient,
  userId: string,
  entityId: string
): Promise<{
  entity: SemanticEntity;
  aliases: string[];
  attributes: Record<string, unknown>;
  relationships: SemanticRelationship[];
  facts: SemanticFact[];
  evidence: SemanticEvidence[];
} | null> {
  const { data: entity } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("id", entityId)
    .maybeSingle();

  if (!entity) return null;

  const [{ data: relationships }, { data: facts }, { data: links }] =
    await Promise.all([
      supabase
        .from("semantic_relationships")
        .select(SEMANTIC_RELATIONSHIP_SELECT)
        .eq("user_id", userId)
        .or(
          `source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`
        )
        .limit(100),
      supabase
        .from("semantic_facts")
        .select(SEMANTIC_FACT_SELECT)
        .eq("user_id", userId)
        .eq("subject_entity_id", entityId)
        .eq("status", "active")
        .limit(100),
      supabase
        .from("semantic_evidence_links")
        .select("evidence_id")
        .eq("user_id", userId)
        .eq("semantic_object_type", "entity")
        .eq("semantic_object_id", entityId),
    ]);

  const evidenceIds = (links ?? []).map((l) => l.evidence_id as string);
  let evidence: SemanticEvidence[] = [];
  if (evidenceIds.length > 0) {
    const { data } = await supabase
      .from("semantic_evidence")
      .select(
        "id, user_id, source_type, source_id, space_id, source_title, source_excerpt, source_metadata, created_at"
      )
      .eq("user_id", userId)
      .in("id", evidenceIds)
      .limit(50);
    evidence = (data ?? []) as SemanticEvidence[];
  }

  const row = entity as SemanticEntity;
  return {
    entity: row,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    attributes:
      row.attributes && typeof row.attributes === "object"
        ? (row.attributes as Record<string, unknown>)
        : {},
    relationships: (relationships ?? []) as SemanticRelationship[],
    facts: (facts ?? []) as SemanticFact[],
    evidence,
  };
}

export async function listSemanticRelationships(
  supabase: SupabaseClient,
  userId: string,
  options: { type?: string; limit?: number } = {}
): Promise<SemanticRelationship[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  let query = supabase
    .from("semantic_relationships")
    .select(SEMANTIC_RELATIONSHIP_SELECT)
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options.type) {
    query = query.eq("relationship_type", options.type);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SemanticRelationship[];
}

export async function getSemanticStats(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  totalEntities: number;
  people: number;
  organizations: number;
  opportunities: number;
  deadlines: number;
  relationships: number;
  facts: number;
}> {
  const [
    { count: totalEntities },
    { count: people },
    { count: organizations },
    { count: opportunities },
    { count: deadlines },
    { count: relationships },
    { count: facts },
  ] = await Promise.all([
    supabase
      .from("semantic_entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("semantic_entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entity_type", "person"),
    supabase
      .from("semantic_entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entity_type", "organization"),
    supabase
      .from("semantic_entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entity_type", "opportunity"),
    supabase
      .from("semantic_entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("entity_type", "deadline"),
    supabase
      .from("semantic_relationships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("semantic_facts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  return {
    totalEntities: totalEntities ?? 0,
    people: people ?? 0,
    organizations: organizations ?? 0,
    opportunities: opportunities ?? 0,
    deadlines: deadlines ?? 0,
    relationships: relationships ?? 0,
    facts: facts ?? 0,
  };
}
