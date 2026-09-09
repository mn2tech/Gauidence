/**
 * Server helper: load permission-safe entities and build World Map graph.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getImportantEntities, getAuthorizedWorldSpaceIds } from "./api";
import {
  buildWorldMapGraph,
  WORLD_MAP_DEFAULT_MAX_NODES,
  type WorldMapGraph,
} from "./mapGraph";

export async function getWorldMap(
  supabase: SupabaseClient,
  userId: string,
  options: {
    expandedGroups?: Array<"people" | "organizations" | "events" | "things">;
    maxNodes?: number;
    userLabel?: string;
  } = {}
): Promise<WorldMapGraph> {
  const spaceIds = await getAuthorizedWorldSpaceIds(supabase, userId);
  void spaceIds;
  const entities = await getImportantEntities(supabase, userId, {
    limit: 80,
  });

  return buildWorldMapGraph({
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      importance: e.importance,
      description: e.description,
    })),
    expandedGroups: options.expandedGroups,
    maxNodes: options.maxNodes ?? WORLD_MAP_DEFAULT_MAX_NODES,
    userLabel: options.userLabel,
  });
}
