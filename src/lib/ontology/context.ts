import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchOntology } from "./search";
import type { OntologyContext, OntologyEntity } from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_EVIDENCE_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
} from "./types";

/**
 * Load one-hop ontology context for Gideon (or other consumers).
 * Scoped to a single Space (profile_id). Safe to call frequently.
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

  const { entities } = await searchOntology(supabase, args.spaceId, trimmed, {
    limit: 5,
  });

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
      .limit(20),
    supabase
      .from("ontology_evidence")
      .select(ONTOLOGY_EVIDENCE_SELECT)
      .eq("profile_id", args.spaceId)
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(10),
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
