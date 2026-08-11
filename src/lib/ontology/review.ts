import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OntologyEntity,
  OntologyRelationship,
  OntologyReviewStatus,
} from "./types";
import {
  ONTOLOGY_ENTITY_SELECT,
  ONTOLOGY_RELATIONSHIP_SELECT,
} from "./types";

export type ReviewQueueItem =
  | {
      kind: "entity";
      item: OntologyEntity;
    }
  | {
      kind: "relationship";
      item: OntologyRelationship;
      sourceName?: string;
      targetName?: string;
    };

export async function listPendingReview(
  supabase: SupabaseClient,
  profileId: string,
  limit = 50
): Promise<ReviewQueueItem[]> {
  const [entitiesRes, relationshipsRes] = await Promise.all([
    supabase
      .from("ontology_entities")
      .select(ONTOLOGY_ENTITY_SELECT)
      .eq("profile_id", profileId)
      .eq("review_status", "pending")
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("ontology_relationships")
      .select(ONTOLOGY_RELATIONSHIP_SELECT)
      .eq("profile_id", profileId)
      .eq("review_status", "pending")
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  const entities = (entitiesRes.data as OntologyEntity[] | null) ?? [];
  const relationships =
    (relationshipsRes.data as OntologyRelationship[] | null) ?? [];

  const nameIds = [
    ...new Set(
      relationships.flatMap((r) => [r.source_entity_id, r.target_entity_id])
    ),
  ];
  const nameMap: Record<string, string> = {};
  if (nameIds.length) {
    const { data } = await supabase
      .from("ontology_entities")
      .select("id, name")
      .in("id", nameIds);
    for (const row of data ?? []) {
      nameMap[row.id] = row.name;
    }
  }

  const items: ReviewQueueItem[] = [
    ...entities.map((item) => ({ kind: "entity" as const, item })),
    ...relationships.map((item) => ({
      kind: "relationship" as const,
      item,
      sourceName: nameMap[item.source_entity_id],
      targetName: nameMap[item.target_entity_id],
    })),
  ];

  return items.slice(0, limit);
}

export async function setReviewStatus(
  supabase: SupabaseClient,
  args: {
    kind: "entity" | "relationship";
    id: string;
    status: OntologyReviewStatus;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!["pending", "confirmed", "rejected"].includes(args.status)) {
    return { ok: false, error: "Invalid review status." };
  }

  const table =
    args.kind === "entity" ? "ontology_entities" : "ontology_relationships";

  const { error } = await supabase
    .from(table)
    .update({ review_status: args.status })
    .eq("id", args.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
