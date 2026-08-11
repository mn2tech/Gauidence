import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OntologyEntity, OntologyRelationship } from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
  ONTOLOGY_VISIBLE_REVIEW_STATUSES,
} from "./types";

export type SpaceOntologyGraph = {
  entities: OntologyEntity[];
  relationships: OntologyRelationship[];
  truncated: boolean;
};

/**
 * Load a Space-wide ontology graph for the admin map.
 * Excludes rejected rows. Caps size for SVG performance.
 */
export async function getSpaceOntologyGraph(
  supabase: SupabaseClient,
  args: {
    spaceId: string;
    maxEntities?: number;
    maxRelationships?: number;
    /** When true (default), hide MENTIONED_IN document edges to reduce clutter. */
    hideDocumentMentions?: boolean;
  }
): Promise<SpaceOntologyGraph> {
  const maxEntities = args.maxEntities ?? 80;
  const maxRelationships = args.maxRelationships ?? 150;
  const hideDocumentMentions = args.hideDocumentMentions ?? true;

  let relQuery = supabase
    .from("ontology_relationships")
    .select(ONTOLOGY_RELATIONSHIP_SELECT)
    .eq("profile_id", args.spaceId)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(maxRelationships + 1);

  if (hideDocumentMentions) {
    relQuery = relQuery.neq("relationship_type", "MENTIONED_IN");
  }

  const { data: relRows } = await relQuery;
  const allRels = (relRows as OntologyRelationship[] | null) ?? [];
  const truncatedRels = allRels.length > maxRelationships;
  const relationships = allRels.slice(0, maxRelationships);

  const entityIds = [
    ...new Set(
      relationships.flatMap((r) => [r.source_entity_id, r.target_entity_id])
    ),
  ];

  if (!entityIds.length) {
    // Fall back to recent entities if no relationships yet.
    const { data: entities } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("profile_id", args.spaceId)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(Math.min(maxEntities, 40));

    return {
      entities: (entities as OntologyEntity[] | null) ?? [],
      relationships: [],
      truncated: false,
    };
  }

  const truncatedEntities = entityIds.length > maxEntities;
  const limitedIds = entityIds.slice(0, maxEntities);
  const idSet = new Set(limitedIds);

  const { data: entities } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .in("id", limitedIds)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES);

  const filteredRels = relationships.filter(
    (r) => idSet.has(r.source_entity_id) && idSet.has(r.target_entity_id)
  );

  return {
    entities: (entities as OntologyEntity[] | null) ?? [],
    relationships: filteredRels,
    truncated: truncatedRels || truncatedEntities,
  };
}
