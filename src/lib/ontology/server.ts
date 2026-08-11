import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOntologyEntity } from "./resolve";
import { normalizeEntityName } from "./normalize";
import type { OntologyEntity, OntologySourceType } from "./types";
import { ONTOLOGY_ENTITY_SELECT } from "./types";

export async function createManualEntity(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    userId: string;
    entityType: string;
    name: string;
    description?: string;
    aliases?: string[];
    properties?: Record<string, unknown>;
  }
): Promise<OntologyEntity> {
  const result = await resolveOntologyEntity(supabase, {
    spaceId: args.profileId,
    entityType: args.entityType,
    name: args.name,
    aliases: args.aliases,
    description: args.description,
    sourceType: "manual",
    createdBy: args.userId,
    confidence: 1,
  });

  if (args.properties && Object.keys(args.properties).length) {
    await supabase
      .from("ontology_entities")
      .update({
        properties: args.properties,
        source_type: "manual",
        review_status: "confirmed",
      })
      .eq("id", result.entity.id);
  } else if (result.entity.review_status !== "confirmed") {
    await supabase
      .from("ontology_entities")
      .update({ review_status: "confirmed", source_type: "manual" })
      .eq("id", result.entity.id);
  }

  return result.entity;
}

export async function createManualRelationship(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    userId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    properties?: Record<string, unknown>;
  }
): Promise<{ id: string }> {
  const { data: existing } = await supabase
    .from("ontology_relationships")
    .select("id")
    .eq("profile_id", args.profileId)
    .eq("source_entity_id", args.sourceEntityId)
    .eq("target_entity_id", args.targetEntityId)
    .eq("relationship_type", args.relationshipType)
    .maybeSingle();

  if (existing?.id) return { id: existing.id };

  const { data, error } = await supabase
    .from("ontology_relationships")
    .insert({
      profile_id: args.profileId,
      source_entity_id: args.sourceEntityId,
      relationship_type: args.relationshipType.toUpperCase(),
      target_entity_id: args.targetEntityId,
      properties: args.properties ?? {},
      confidence: 1,
      review_status: "confirmed",
      created_by: args.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create relationship");
  }

  return { id: data.id };
}

/**
 * Delete an ontology entity without touching the underlying Guardian source record.
 */
export async function deleteOntologyEntity(
  supabase: SupabaseClient,
  entityId: string
): Promise<void> {
  const { data: entity } = await supabase
    .from("ontology_entities")
    .select("id, source_type, source_id")
    .eq("id", entityId)
    .maybeSingle();

  if (!entity) {
    throw new Error("Entity not found");
  }

  await supabase.from("ontology_entities").delete().eq("id", entityId);
}

export async function getOntologySpaceStats(
  supabase: SupabaseClient,
  profileId: string
): Promise<{
  entityCount: number;
  relationshipCount: number;
  evidenceCount: number;
  needsReview: number;
}> {
  const [entities, relationships, evidence, pendingEntities, pendingRels] =
    await Promise.all([
      supabase
        .from("ontology_entities")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .neq("review_status", "rejected"),
      supabase
        .from("ontology_relationships")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .neq("review_status", "rejected"),
      supabase
        .from("ontology_evidence")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId),
      supabase
        .from("ontology_entities")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("review_status", "pending"),
      supabase
        .from("ontology_relationships")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("review_status", "pending"),
    ]);

  return {
    entityCount: entities.count ?? 0,
    relationshipCount: relationships.count ?? 0,
    evidenceCount: evidence.count ?? 0,
    needsReview: (pendingEntities.count ?? 0) + (pendingRels.count ?? 0),
  };
}

export function parseSourceType(value: string | null | undefined): OntologySourceType | null {
  const valid: OntologySourceType[] = [
    "manual",
    "document",
    "daily_log",
    "memory",
    "proposal",
    "api",
    "connector",
  ];
  if (!value) return null;
  return valid.includes(value as OntologySourceType)
    ? (value as OntologySourceType)
    : null;
}

export { normalizeEntityName, ONTOLOGY_ENTITY_SELECT };
