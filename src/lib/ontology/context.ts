import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "./normalize";
import type { OntologyContext, OntologyEntity } from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_EVIDENCE_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
} from "./types";

/**
 * Load one-hop ontology context for Gideon (or other consumers).
 * Optimized for chat latency: parallel queries, no exact counts, small limits.
 */
export async function getOntologyContext(
  supabase: SupabaseClient,
  args: { spaceId: string; query: string }
): Promise<OntologyContext> {
  const empty: OntologyContext = {
    matchedEntities: [],
    relationships: [],
    evidence: [],
    entityNames: {},
  };

  const trimmed = args.query.trim();
  if (!trimmed) return empty;

  // Prefer distinctive tokens for matching (skip tiny words).
  const tokens = normalizeEntityName(trimmed)
    .split(" ")
    .filter((t) => t.length >= 3)
    .slice(0, 4);
  const searchTerms =
    tokens.length > 0 ? tokens : [normalizeEntityName(trimmed)].filter(Boolean);
  if (!searchTerms.length) return empty;

  const safeTerms = searchTerms.map((term) =>
    term.replace(/[%_\\]/g, "\\$&").slice(0, 48)
  );

  const entityQueries = safeTerms.map((term) =>
    supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("profile_id", args.spaceId)
      .or(`name.ilike.%${term}%,canonical_name.ilike.%${term}%`)
      .limit(5)
  );
  const aliasQueries = safeTerms.map((term) =>
    supabase
      .from("ontology_entity_aliases")
      .select("entity_id")
      .eq("profile_id", args.spaceId)
      .ilike("normalized_alias", `%${term}%`)
      .limit(8)
  );

  const [entityResults, aliasResults] = await Promise.all([
    Promise.all(entityQueries),
    Promise.all(aliasQueries),
  ]);

  const byId = new Map<string, OntologyEntity>();
  for (const res of entityResults) {
    for (const row of (res.data as OntologyEntity[] | null) ?? []) {
      byId.set(row.id, row);
    }
  }

  const aliasIds = [
    ...new Set(
      aliasResults.flatMap((res) =>
        (res.data ?? []).map((a) => a.entity_id as string)
      )
    ),
  ].filter((id) => !byId.has(id));

  if (aliasIds.length) {
    const { data: aliasEntities } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", aliasIds.slice(0, 5));
    for (const row of (aliasEntities as OntologyEntity[] | null) ?? []) {
      byId.set(row.id, row);
    }
  }

  const entities = [...byId.values()].slice(0, 5);
  if (!entities.length) return empty;

  const entityIds = entities.map((e) => e.id);
  const entityNames: Record<string, string> = {};
  for (const entity of entities) {
    entityNames[entity.id] = entity.name;
  }

  const [relationshipsRes, evidenceRes] = await Promise.all([
    supabase
      .from("ontology_relationships")
      .select(ONTOLOGY_RELATIONSHIP_SELECT)
      .eq("profile_id", args.spaceId)
      .or(
        `source_entity_id.in.(${entityIds.join(",")}),target_entity_id.in.(${entityIds.join(",")})`
      )
      .limit(12),
    supabase
      .from("ontology_evidence")
      .select(ONTOLOGY_EVIDENCE_SELECT)
      .eq("profile_id", args.spaceId)
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const relationships = relationshipsRes.data ?? [];
  const missingIds = new Set<string>();
  for (const rel of relationships) {
    if (!entityNames[rel.source_entity_id]) missingIds.add(rel.source_entity_id);
    if (!entityNames[rel.target_entity_id]) missingIds.add(rel.target_entity_id);
  }

  if (missingIds.size) {
    const { data: extras } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", [...missingIds]);
    for (const entity of (extras as OntologyEntity[] | null) ?? []) {
      entityNames[entity.id] = entity.name;
    }
  }

  return {
    matchedEntities: entities,
    relationships,
    evidence: evidenceRes.data ?? [],
    entityNames,
  };
}
