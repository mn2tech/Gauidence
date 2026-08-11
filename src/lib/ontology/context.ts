import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchOntology } from "./search";
import type { OntologyContext } from "./types";
import { ONTOLOGY_EVIDENCE_SELECT, ONTOLOGY_RELATIONSHIP_SELECT } from "./types";

/**
 * Prepare ontology context for future Gideon integration.
 * Phase 1: search matched entities and their one-hop relationships.
 */
export async function getOntologyContext(
  supabase: SupabaseClient,
  args: { spaceId: string; query: string }
): Promise<OntologyContext> {
  const { entities } = await searchOntology(supabase, args.spaceId, args.query, {
    limit: 5,
  });

  if (!entities.length) {
    return { matchedEntities: [], relationships: [], evidence: [] };
  }

  const entityIds = entities.map((e) => e.id);

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
      .limit(20),
  ]);

  return {
    matchedEntities: entities,
    relationships: relationshipsRes.data ?? [],
    evidence: evidenceRes.data ?? [],
  };
}
