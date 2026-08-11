import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "./normalize";
import type { OntologyEntity } from "./types";
import { ONTOLOGY_ENTITY_SELECT } from "./types";

export type OntologySearchResult = {
  entities: OntologyEntity[];
  total: number;
};

export async function searchOntology(
  supabase: SupabaseClient,
  spaceId: string,
  query: string,
  options: { limit?: number; entityType?: string } = {}
): Promise<OntologySearchResult> {
  const trimmed = query.trim();
  const limit = options.limit ?? 25;

  if (!trimmed) {
    let listQuery = supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT, { count: "exact" })
      .eq("profile_id", spaceId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (options.entityType) {
      listQuery = listQuery.eq("entity_type", options.entityType);
    }

    const { data, count } = await listQuery;
    return {
      entities: (data as OntologyEntity[]) ?? [],
      total: count ?? 0,
    };
  }

  const normalized = normalizeEntityName(trimmed);
  const escaped = trimmed.replace(/[%_\\]/g, "\\$&");

  const { data: aliasMatches } = await supabase
    .from("ontology_entity_aliases")
    .select("entity_id")
    .eq("profile_id", spaceId)
    .ilike("normalized_alias", `%${normalized}%`);

  const aliasEntityIds = [...new Set((aliasMatches ?? []).map((a) => a.entity_id))];

  let entityQuery = supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT, { count: "exact" })
    .eq("profile_id", spaceId)
    .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options.entityType) {
    entityQuery = entityQuery.eq("entity_type", options.entityType);
  }

  const { data: directMatches, count } = await entityQuery;

  const directIds = new Set((directMatches ?? []).map((e) => e.id));
  const extraIds = aliasEntityIds.filter((id) => !directIds.has(id));

  let extraEntities: OntologyEntity[] = [];
  if (extraIds.length) {
    const { data } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", extraIds.slice(0, limit));
    extraEntities = (data as OntologyEntity[]) ?? [];
  }

  const entities = [...((directMatches as OntologyEntity[]) ?? []), ...extraEntities].slice(
    0,
    limit
  );

  return {
    entities,
    total: (count ?? 0) + extraEntities.length,
  };
}
