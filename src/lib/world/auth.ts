/**
 * Space-permission filters for My World reads (server).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SemanticEntity } from "@/lib/semantic/types";
import { SEMANTIC_ENTITY_SELECT } from "@/lib/semantic/types";
import {
  filterEntitiesByAuthorizedSpaces,
  entityHasAuthorizedEvidence,
} from "./authFilter";
import type { WorldEntity } from "./types";

export {
  filterEntitiesByAuthorizedSpaces,
  entityHasAuthorizedEvidence,
} from "./authFilter";
export type { AuthorizedSpaceSet } from "./authFilter";

/**
 * List world entities visible under Space membership.
 * Pass authorizedSpaceIds from the caller's accessible Spaces.
 */
export async function listWorldEntitiesVisible(
  supabase: SupabaseClient,
  args: {
    userId: string;
    authorizedSpaceIds: string[];
    type?: string;
    search?: string;
    limit?: number;
    includeStatuses?: string[];
  }
): Promise<WorldEntity[]> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const statuses = args.includeStatuses ?? ["active", "candidate"];
  const authorized = new Set(args.authorizedSpaceIds);

  let query = supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", args.userId)
    .in("status", statuses)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(limit * 3, 400));

  if (args.type) {
    query = query.eq("entity_type", args.type);
  }

  if (args.search?.trim()) {
    const q = args.search.trim();
    query = query.or(
      `canonical_name.ilike.%${q}%,normalized_name.ilike.%${q.toLowerCase()}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const entities = (data ?? []) as SemanticEntity[];
  if (entities.length === 0) return [];

  const entityIds = entities.map((e) => e.id);
  const { data: links } = await supabase
    .from("semantic_evidence_links")
    .select("semantic_object_id, evidence_id")
    .eq("user_id", args.userId)
    .eq("semantic_object_type", "entity")
    .in("semantic_object_id", entityIds);

  const evidenceIds = [
    ...new Set((links ?? []).map((l) => l.evidence_id as string)),
  ];

  const evidenceSpaceById = new Map<string, string | null>();
  if (evidenceIds.length > 0) {
    const { data: evidence } = await supabase
      .from("semantic_evidence")
      .select("id, space_id")
      .eq("user_id", args.userId)
      .in("id", evidenceIds);
    for (const row of evidence ?? []) {
      evidenceSpaceById.set(
        row.id as string,
        (row.space_id as string | null) ?? null
      );
    }
  }

  const entityEvidenceSpaces = new Map<string, Array<string | null>>();
  for (const link of links ?? []) {
    const entityId = link.semantic_object_id as string;
    const space = evidenceSpaceById.get(link.evidence_id as string);
    const list = entityEvidenceSpaces.get(entityId) ?? [];
    list.push(space === undefined ? null : space);
    entityEvidenceSpaces.set(entityId, list);
  }

  const visible = filterEntitiesByAuthorizedSpaces({
    entities,
    entityEvidenceSpaces,
    authorizedSpaceIds: authorized,
  });

  return visible.slice(0, limit);
}
