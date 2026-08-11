import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OntologyEntity,
  OntologyPath,
  OntologyPathHop,
  OntologyRelationship,
} from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
  ONTOLOGY_VISIBLE_REVIEW_STATUSES,
} from "./types";

export type GetEntityPathsArgs = {
  spaceId: string;
  fromEntityId: string;
  toEntityId?: string;
  maxHops?: 1 | 2;
  limit?: number;
};

/**
 * Find short paths (1–2 hops) between entities in a Space.
 * Rejected relationships/entities are excluded.
 */
export async function getEntityPaths(
  supabase: SupabaseClient,
  args: GetEntityPathsArgs
): Promise<OntologyPath[]> {
  const maxHops = args.maxHops ?? 2;
  const limit = args.limit ?? 12;

  const { data: relRows } = await supabase
    .from("ontology_relationships")
    .select(ONTOLOGY_RELATIONSHIP_SELECT)
    .eq("profile_id", args.spaceId)
    .in("review_status", ONTOLOGY_VISIBLE_REVIEW_STATUSES)
    .limit(500);

  const relationships = (relRows as OntologyRelationship[] | null) ?? [];
  if (!relationships.length) return [];

  const adjacency = new Map<
    string,
    { otherId: string; rel: OntologyRelationship; direction: "out" | "in" }[]
  >();

  for (const rel of relationships) {
    const out = adjacency.get(rel.source_entity_id) ?? [];
    out.push({ otherId: rel.target_entity_id, rel, direction: "out" });
    adjacency.set(rel.source_entity_id, out);

    const inn = adjacency.get(rel.target_entity_id) ?? [];
    inn.push({ otherId: rel.source_entity_id, rel, direction: "in" });
    adjacency.set(rel.target_entity_id, inn);
  }

  type PartialPath = {
    nodeIds: string[];
    edges: OntologyPathHop[];
  };

  const found: PartialPath[] = [];
  const queue: PartialPath[] = [{ nodeIds: [args.fromEntityId], edges: [] }];
  const seenKeys = new Set<string>([args.fromEntityId]);

  while (queue.length && found.length < limit * 3) {
    const current = queue.shift()!;
    const depth = current.edges.length;
    if (depth >= maxHops) continue;

    const lastId = current.nodeIds[current.nodeIds.length - 1]!;
    const neighbors = adjacency.get(lastId) ?? [];

    for (const neighbor of neighbors) {
      if (current.nodeIds.includes(neighbor.otherId)) continue;

      const orderedHop: OntologyPathHop =
        neighbor.direction === "out"
          ? {
              relationshipId: neighbor.rel.id,
              relationshipType: neighbor.rel.relationship_type,
              fromEntityId: lastId,
              toEntityId: neighbor.otherId,
              confidence: neighbor.rel.confidence,
            }
          : {
              relationshipId: neighbor.rel.id,
              relationshipType: neighbor.rel.relationship_type,
              fromEntityId: neighbor.otherId,
              toEntityId: lastId,
              confidence: neighbor.rel.confidence,
            };

      const next: PartialPath = {
        nodeIds: [...current.nodeIds, neighbor.otherId],
        edges: [...current.edges, orderedHop],
      };

      const key = next.nodeIds.join(">");
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const hops = next.edges.length;
      const reachesTarget =
        !args.toEntityId || neighbor.otherId === args.toEntityId;

      if (hops >= 1 && reachesTarget) {
        found.push(next);
        if (found.length >= limit) break;
      }

      if (hops < maxHops) {
        queue.push(next);
      }
    }
  }

  // When no explicit target, keep one-hop and two-hop paths from source.
  let paths = found;
  if (!args.toEntityId) {
    paths = found.filter((p) => p.edges.length >= 1).slice(0, limit);
  } else {
    paths = found
      .filter((p) => p.nodeIds[p.nodeIds.length - 1] === args.toEntityId)
      .slice(0, limit);
  }

  const entityIds = [...new Set(paths.flatMap((p) => p.nodeIds))];
  const nameMap: Record<string, string> = {};
  if (entityIds.length) {
    const { data: entities } = await supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .in("id", entityIds)
      .neq("review_status", "rejected");
    for (const e of (entities as OntologyEntity[] | null) ?? []) {
      nameMap[e.id] = e.name;
    }
  }

  return paths
    .filter((p) => p.nodeIds.every((id) => nameMap[id]))
    .map((p) => {
      const nodeNames = p.nodeIds.map((id) => nameMap[id] ?? "Unknown");
      const edgeLabels = p.edges.map((e) => e.relationshipType);
      const parts: string[] = [nodeNames[0]!];
      for (let i = 0; i < edgeLabels.length; i++) {
        parts.push(`—[${edgeLabels[i]}]→`, nodeNames[i + 1]!);
      }
      return {
        hops: p.edges.length,
        nodeIds: p.nodeIds,
        nodeNames,
        edges: p.edges,
        label: parts.join(" "),
      };
    });
}

/** Build 2-hop paths between pairs of matched entities for Gideon. */
export async function getPathsBetweenMatchedEntities(
  supabase: SupabaseClient,
  spaceId: string,
  entityIds: string[],
  limit = 6
): Promise<OntologyPath[]> {
  if (entityIds.length < 2) return [];

  const pairs: [string, string][] = [];
  for (let i = 0; i < entityIds.length; i++) {
    for (let j = i + 1; j < entityIds.length; j++) {
      pairs.push([entityIds[i]!, entityIds[j]!]);
    }
  }

  const all: OntologyPath[] = [];
  for (const [from, to] of pairs.slice(0, 6)) {
    const paths = await getEntityPaths(supabase, {
      spaceId,
      fromEntityId: from,
      toEntityId: to,
      maxHops: 2,
      limit: 3,
    });
    all.push(...paths);
    if (all.length >= limit) break;
  }

  return all.slice(0, limit);
}
