import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInvoiceAggregateQuery, isSongCatalogQuery, isConnectedChartQuery, tokenizeForOntologySearch, titlePhraseForOntologySearch } from "./normalize";
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

  const listInvoices = isInvoiceAggregateQuery(trimmed);
  const listSongs = isSongCatalogQuery(trimmed);
  const listCharts = isConnectedChartQuery(trimmed);
  const searchTerms = tokenizeForOntologySearch(trimmed);
  const titlePhrase = titlePhraseForOntologySearch(trimmed)?.replace(
    /[%_\\]/g,
    "\\$&"
  );
  if (!searchTerms.length && !listInvoices && !listSongs && !listCharts && !titlePhrase) {
    return empty;
  }

  const safeTerms = searchTerms.map((term) =>
    term.replace(/[%_\\]/g, "\\$&").slice(0, 48)
  );

  const entityQueries = [
    ...safeTerms.map((term) =>
      supabase
        .from("ontology_entities")
        .select(ONTOLOGY_ENTITY_SELECT)
        .eq("profile_id", args.spaceId)
        .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
        .or(
          `name.ilike.%${term}%,canonical_name.ilike.%${term}%,description.ilike.%${term}%`
        )
        .limit(listInvoices || listSongs || listCharts ? 16 : 8)
    ),
    ...(titlePhrase
      ? [
          supabase
            .from("ontology_entities")
            .select(ONTOLOGY_ENTITY_SELECT)
            .eq("profile_id", args.spaceId)
            .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
            .or(
              `name.ilike.%${titlePhrase}%,canonical_name.ilike.%${titlePhrase}%,description.ilike.%${titlePhrase}%`
            )
            .limit(8),
        ]
      : []),
  ];
  const aliasQueries = safeTerms.map((term) =>
    supabase
      .from("ontology_entity_aliases")
      .select("entity_id")
      .eq("profile_id", args.spaceId)
      .ilike("normalized_alias", `%${term}%`)
      .limit(8)
  );

  const [entityResults, aliasResults, connectorEntities, invoiceEntities] =
    await Promise.all([
      Promise.all(entityQueries),
      Promise.all(aliasQueries),
      args.userId
        ? findConnectorEntitiesForQuery(supabase, {
            userId: args.userId,
            terms: safeTerms.length ? safeTerms : ["invoice"],
            preferSpaceId: args.spaceId,
            listInvoices,
            listSongs,
            listCharts,
            titlePhrase: titlePhrase ?? undefined,
          })
        : Promise.resolve([] as OntologyEntity[]),
      listInvoices
        ? loadInvoiceEntities(supabase, args.spaceId)
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

  for (const row of invoiceEntities) {
    byId.set(row.id, row);
  }
  for (const row of connectorEntities) {
    byId.set(row.id, row);
  }

  const ranked = rankEntitiesByQueryTokens([...byId.values()], searchTerms);
  const entities = listInvoices
    ? preferInvoicesFirst(ranked).slice(0, 20)
    : listSongs || listCharts
      ? preferSongCatalogFirst(ranked).slice(0, 40)
      : ranked.slice(0, 5);
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

async function loadInvoiceEntities(
  supabase: SupabaseClient,
  spaceId: string
): Promise<OntologyEntity[]> {
  const { data } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("profile_id", spaceId)
    .in("entity_type", ["invoice", "purchase"])
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(25);
  return (data as OntologyEntity[] | null) ?? [];
}

async function findConnectorEntitiesForQuery(
  supabase: SupabaseClient,
  args: {
    userId: string;
    terms: string[];
    preferSpaceId: string;
    listInvoices?: boolean;
    listSongs?: boolean;
    listCharts?: boolean;
    titlePhrase?: string;
  }
): Promise<OntologyEntity[]> {
  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id, profile_id")
    .eq("user_id", args.userId)
    .neq("status", "disconnected")
    .limit(20);

  const sourceIds = (sources ?? []).map((s) => s.id as string);
  if (!sourceIds.length) return [];

  const boundProfileIds = [
    ...new Set(
      (sources ?? [])
        .map((s) => s.profile_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const searchProfileIds = [
    ...new Set([args.preferSpaceId, ...boundProfileIds]),
  ];

  const listConnectorCatalog = args.listInvoices || args.listSongs;

  let itemIds: string[] = [];
  if (listConnectorCatalog) {
    const { data: items } = await supabase
      .from("source_items")
      .select("id, name, processing_status")
      .in("source_id", sourceIds)
      .eq("processing_status", "analyzed")
      .limit(args.listSongs || args.listCharts ? 80 : 40);
    itemIds = (items ?? []).map((i) => i.id as string);
  } else if (args.terms.length || args.titlePhrase) {
    const nameTerms = [
      ...args.terms,
      ...(args.titlePhrase ? [args.titlePhrase] : []),
    ];
    const orName = nameTerms.map((t) => `name.ilike.%${t}%`).join(",");
    const { data: items } = await supabase
      .from("source_items")
      .select("id, name, processing_status")
      .in("source_id", sourceIds)
      .neq("processing_status", "unavailable")
      .or(orName)
      .limit(12);
    itemIds = (items ?? []).map((i) => i.id as string);

    // …and also song/entity names from already-analyzed connector items
    // (board name "Living Waters" won't match "Ibadat Karo").
    const { data: analyzed } = await supabase
      .from("source_items")
      .select("id")
      .in("source_id", sourceIds)
      .eq("processing_status", "analyzed")
      .limit(80);
    const analyzedIds = (analyzed ?? []).map((i) => i.id as string);
    if (analyzedIds.length) {
      const orEntity = nameTerms
        .map(
          (t) =>
            `name.ilike.%${t}%,canonical_name.ilike.%${t}%,description.ilike.%${t}%`
        )
        .join(",");
      let entityByName = supabase
        .from("ontology_entities")
        .select(ONTOLOGY_ENTITY_SELECT)
        .eq("source_type", "connector")
        .in("source_id", analyzedIds)
        .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
        .or(orEntity)
        .limit(20);
      if (searchProfileIds.length) {
        entityByName = entityByName.in("profile_id", searchProfileIds);
      }
      const { data: named } = await entityByName;
      if (named?.length) {
        return [...(named as OntologyEntity[])].sort((a, b) => {
          const ap = a.profile_id === args.preferSpaceId ? 1 : 0;
          const bp = b.profile_id === args.preferSpaceId ? 1 : 0;
          return bp - ap;
        });
      }
    }
  }
  if (!itemIds.length) return [];

  let entityQuery = supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("source_type", "connector")
    .in("source_id", itemIds)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(args.listSongs || args.listCharts ? 80 : args.listInvoices ? 40 : 20);

  if (args.listInvoices) {
    entityQuery = entityQuery.in("entity_type", [
      "invoice",
      "purchase",
      "document",
      "organization",
    ]);
  } else if (args.listSongs || args.listCharts) {
    entityQuery = entityQuery.in("entity_type", [
      "document",
      "product",
      "asset",
      "movie",
      "project",
      "event",
    ]);
  }

  const { data: entities } = await entityQuery;

  const rows = (entities as OntologyEntity[] | null) ?? [];
  return [...rows].sort((a, b) => {
    const ap = a.profile_id === args.preferSpaceId ? 1 : 0;
    const bp = b.profile_id === args.preferSpaceId ? 1 : 0;
    return bp - ap;
  });
}

function preferInvoicesFirst(entities: OntologyEntity[]): OntologyEntity[] {
  return [...entities].sort((a, b) => {
    const ai = a.entity_type === "invoice" || a.entity_type === "purchase" ? 1 : 0;
    const bi = b.entity_type === "invoice" || b.entity_type === "purchase" ? 1 : 0;
    return bi - ai;
  });
}

function preferSongCatalogFirst(entities: OntologyEntity[]): OntologyEntity[] {
  return [...entities].sort((a, b) => {
    const score = (e: OntologyEntity) => {
      let s = 0;
      if (e.entity_type === "document" || e.entity_type === "product") s += 4;
      if (e.entity_type === "asset" || e.entity_type === "movie") s += 3;
      // Prefer song titles over the board container itself.
      if (!/\btrello board\b/i.test(e.name) && e.entity_type === "document") s += 2;
      if (/\b(chart|chord|lyrics|key)\b/i.test(e.description ?? "")) s += 1;
      return s;
    };
    return score(b) - score(a);
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
    const tokenHits = tokens.filter((token) => hay.includes(token)).length;
    if (tokenHits >= 2) hits += 4;
    const props = entity.properties ?? {};
    if (
      tokens.some((t) => t === "chord" || t === "lyric" || t === "key") &&
      (typeof props.musical_key === "string" ||
        /\bkey\s+[A-G]/i.test(entity.description ?? ""))
    ) {
      hits += 3;
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
