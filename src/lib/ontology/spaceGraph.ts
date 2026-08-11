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

const PHONE_LIKE = /^[+]?[\d\s().\-/]{7,}$/;
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeJunkEntity(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (PHONE_LIKE.test(trimmed)) return true;
  if (UUID_LIKE.test(trimmed)) return true;
  return false;
}

/**
 * Load a Space-wide ontology graph for the admin map.
 * Excludes rejected rows. Caps size and prioritizes high-degree nodes.
 */
export async function getSpaceOntologyGraph(
  supabase: SupabaseClient,
  args: {
    spaceId: string;
    maxEntities?: number;
    maxRelationships?: number;
    /** When true (default), hide MENTIONED_IN document edges to reduce clutter. */
    hideDocumentMentions?: boolean;
    /** When true, hide RELATED_TO edges. */
    hideRelatedTo?: boolean;
    /** If set, only include entities of these types. */
    entityTypes?: string[];
    /** Drop phone-number / UUID-looking entity names (default true). */
    hideJunkNames?: boolean;
  }
): Promise<SpaceOntologyGraph> {
  const maxEntities = args.maxEntities ?? 48;
  const maxRelationships = args.maxRelationships ?? 90;
  const hideDocumentMentions = args.hideDocumentMentions ?? true;
  const hideRelatedTo = args.hideRelatedTo ?? false;
  const hideJunkNames = args.hideJunkNames ?? true;
  const typeFilter =
    args.entityTypes && args.entityTypes.length
      ? new Set(args.entityTypes.map((t) => t.toLowerCase()))
      : null;

  let relQuery = supabase
    .from("ontology_relationships")
    .select(ONTOLOGY_RELATIONSHIP_SELECT)
    .eq("profile_id", args.spaceId)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(400);

  if (hideDocumentMentions) {
    relQuery = relQuery.neq("relationship_type", "MENTIONED_IN");
  }
  if (hideRelatedTo) {
    relQuery = relQuery.neq("relationship_type", "RELATED_TO");
  }

  const { data: relRows } = await relQuery;
  let relationships = (relRows as OntologyRelationship[] | null) ?? [];

  const candidateIds = [
    ...new Set(
      relationships.flatMap((r) => [r.source_entity_id, r.target_entity_id])
    ),
  ];

  if (!candidateIds.length) {
    let entityQuery = supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("profile_id", args.spaceId)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(Math.min(maxEntities, 40));

    if (typeFilter) {
      entityQuery = entityQuery.in("entity_type", [...typeFilter]);
    }

    const { data: entities } = await entityQuery;
    let list = (entities as OntologyEntity[] | null) ?? [];
    if (hideJunkNames) {
      list = list.filter((e) => !looksLikeJunkEntity(e.name));
    }
    return { entities: list, relationships: [], truncated: false };
  }

  const { data: entityRows } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .in("id", candidateIds.slice(0, 300))
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES);

  let entities = (entityRows as OntologyEntity[] | null) ?? [];
  if (typeFilter) {
    entities = entities.filter((e) => typeFilter.has(e.entity_type));
  }
  if (hideJunkNames) {
    entities = entities.filter((e) => !looksLikeJunkEntity(e.name));
  }

  const allowedIds = new Set(entities.map((e) => e.id));
  relationships = relationships.filter(
    (r) =>
      allowedIds.has(r.source_entity_id) && allowedIds.has(r.target_entity_id)
  );

  // Prefer high-degree entities when capping.
  const degree = new Map<string, number>();
  for (const id of allowedIds) degree.set(id, 0);
  for (const r of relationships) {
    degree.set(r.source_entity_id, (degree.get(r.source_entity_id) ?? 0) + 1);
    degree.set(r.target_entity_id, (degree.get(r.target_entity_id) ?? 0) + 1);
  }

  const ranked = [...entities].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)
  );
  const truncatedEntities = ranked.length > maxEntities;
  const kept = ranked.slice(0, maxEntities);
  const keptIds = new Set(kept.map((e) => e.id));

  relationships = relationships.filter(
    (r) => keptIds.has(r.source_entity_id) && keptIds.has(r.target_entity_id)
  );

  const truncatedRels = relationships.length > maxRelationships;
  relationships = relationships
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, maxRelationships);

  return {
    entities: kept,
    relationships,
    truncated: truncatedEntities || truncatedRels,
  };
}
