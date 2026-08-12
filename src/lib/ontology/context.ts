import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenizeForOntologySearch } from "./normalize";
import { getPathsBetweenMatchedEntities } from "./paths";
import type { OntologyContext, OntologyEntity } from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_EVIDENCE_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
  ONTOLOGY_VISIBLE_REVIEW_STATUSES,
} from "./types";

/**
 * Load ontology context for Gideon (1-hop + optional 2-hop paths).
 * Excludes rejected review items. Optimized for chat latency.
 *
 * Also pulls connector-analyzed entities that match connected filenames
 * across the user's spaces (Device Storage is account-scoped).
 */
export async function getOntologyContext(
  supabase: SupabaseClient,
  args: { spaceId: string; query: string; userId?: string }
): Promise<OntologyContext> {
  const empty: OntologyContext = {
    matchedEntities: [],
    relationships: [],
    evidence: [],
    entityNames: {},
    paths: [],
  };

  const trimmed = args.query.trim();
  if (!trimmed) return empty;

  const searchTerms = tokenizeForOntologySearch(trimmed);
  if (!searchTerms.length) return empty;

  const safeTerms = searchTerms.map((term) =>
    term.replace(/[%_\\]/g, "\\$&").slice(0, 48)
  );

  const entityQueries = safeTerms.map((term) =>
    supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("profile_id", args.spaceId)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .or(
        `name.ilike.%${term}%,canonical_name.ilike.%${term}%,description.ilike.%${term}%`
      )
      .limit(8)
  );
  const aliasQueries = safeTerms.map((term) =>
    supabase
      .from("ontology_entity_aliases")
      .select("entity_id")
      .eq("profile_id", args.spaceId)
      .ilike("normalized_alias", `%${term}%`)
      .limit(8)
  );

  const [entityResults, aliasResults, connectorEntities] = await Promise.all([
    Promise.all(entityQueries),
    Promise.all(aliasQueries),
    args.userId
      ? findConnectorEntitiesForQuery(supabase, {
          userId: args.userId,
          terms: safeTerms,
          preferSpaceId: args.spaceId,
        })
      : Promise.resolve([] as OntologyEntity[]),
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
      .in("id", aliasIds.slice(0, 8))
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES);
    for (const row of (aliasEntities as OntologyEntity[] | null) ?? []) {
      byId.set(row.id, row);
    }
  }

  for (const row of connectorEntities) {
    byId.set(row.id, row);
  }

  const entities = rankEntitiesByQueryTokens([...byId.values()], searchTerms).slice(
    0,
    5
  );
  if (!entities.length) return empty;

  // Relationships/evidence stay space-scoped for the matched entity's profile when possible.
  // Mixed-space connector hits still load their own edges by entity id.
  const entityIds = entities.map((e) => e.id);
  const entityNames: Record<string, string> = {};
  for (const entity of entities) {
    entityNames[entity.id] = entity.name;
  }

  const profileIds = [...new Set(entities.map((e) => e.profile_id))];

  const [relationshipsRes, evidenceRes, paths] = await Promise.all([
    supabase
      .from("ontology_relationships")
      .select(ONTOLOGY_RELATIONSHIP_SELECT)
      .in("profile_id", profileIds)
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
      .or(
        `source_entity_id.in.(${entityIds.join(",")}),target_entity_id.in.(${entityIds.join(",")})`
      )
      .limit(12),
    supabase
      .from("ontology_evidence")
      .select(ONTOLOGY_EVIDENCE_SELECT)
      .in("profile_id", profileIds)
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(6),
    getPathsBetweenMatchedEntities(supabase, args.spaceId, entityIds, 6),
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
      .in("id", [...missingIds])
      .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES);
    for (const entity of (extras as OntologyEntity[] | null) ?? []) {
      entityNames[entity.id] = entity.name;
    }
  }

  return {
    matchedEntities: entities,
    relationships,
    evidence: evidenceRes.data ?? [],
    entityNames,
    paths,
  };
}

async function findConnectorEntitiesForQuery(
  supabase: SupabaseClient,
  args: { userId: string; terms: string[]; preferSpaceId: string }
): Promise<OntologyEntity[]> {
  if (!args.terms.length) return [];

  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id")
    .eq("user_id", args.userId)
    .neq("status", "disconnected")
    .limit(20);

  const sourceIds = (sources ?? []).map((s) => s.id as string);
  if (!sourceIds.length) return [];

  const orName = args.terms.map((t) => `name.ilike.%${t}%`).join(",");
  const { data: items } = await supabase
    .from("source_items")
    .select("id, name, processing_status")
    .in("source_id", sourceIds)
    .neq("processing_status", "unavailable")
    .or(orName)
    .limit(12);

  const itemIds = (items ?? []).map((i) => i.id as string);
  if (!itemIds.length) return [];

  // Entities created from connector analyze use source_type=connector + source_id=item id.
  const { data: entities } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("source_type", "connector")
    .in("source_id", itemIds)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(20);

  const rows = (entities as OntologyEntity[] | null) ?? [];
  // Prefer entities already in the active Ask Gideon space.
  return [...rows].sort((a, b) => {
    const ap = a.profile_id === args.preferSpaceId ? 1 : 0;
    const bp = b.profile_id === args.preferSpaceId ? 1 : 0;
    return bp - ap;
  });
}

function rankEntitiesByQueryTokens(
  entities: OntologyEntity[],
  tokens: string[]
): OntologyEntity[] {
  const score = (entity: OntologyEntity) => {
    const hay = `${entity.name} ${entity.canonical_name} ${entity.description ?? ""}`.toLowerCase();
    let hits = 0;
    for (const token of tokens) {
      if (hay.includes(token)) hits += token.length >= 5 ? 2 : 1;
    }
    if (entity.entity_type === "invoice" || entity.entity_type === "purchase") {
      hits += 3;
    }
    if (entity.entity_type === "organization" || entity.entity_type === "person") {
      hits += 1;
    }
    if (entity.entity_type === "document" && /\.(xlsx|pdf|csv)$/i.test(entity.name)) {
      hits += 2;
    }
    return hits;
  };

  return [...entities].sort((a, b) => score(b) - score(a));
}
