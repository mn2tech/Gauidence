import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "./normalize";
import type { ExtractedEntity } from "./types";

export type ResolvedEntity = {
  name: string;
  normalizedName: string;
  entityType: string;
  existingEntityId: string | null;
  mergeSuggestionId: string | null;
  confidence: number;
  aliases: string[];
};

const AUTO_MERGE_THRESHOLD = 0.92;

export async function resolveEntities(
  supabase: SupabaseClient,
  profileId: string,
  userId: string,
  entities: ExtractedEntity[],
  sourceDocumentId: string
): Promise<ResolvedEntity[]> {
  const { data: existing } = await supabase
    .from("guardian_knowledge_entities")
    .select("id, name, normalized_name, entity_type, canonical_entity_id")
    .eq("profile_id", profileId);

  const { data: aliases } = await supabase
    .from("guardian_knowledge_entity_aliases")
    .select("entity_id, normalized_alias")
    .eq("profile_id", profileId);

  const byNormalized = new Map<
    string,
    { id: string; name: string; entityType: string }
  >();
  for (const row of existing ?? []) {
    const canonicalId = row.canonical_entity_id ?? row.id;
    byNormalized.set(row.normalized_name, {
      id: canonicalId,
      name: row.name,
      entityType: row.entity_type,
    });
  }
  for (const row of aliases ?? []) {
    const match = (existing ?? []).find((e) => e.id === row.entity_id);
    if (match) {
      byNormalized.set(row.normalized_alias, {
        id: match.canonical_entity_id ?? match.id,
        name: match.name,
        entityType: match.entity_type,
      });
    }
  }

  const resolved: ResolvedEntity[] = [];

  for (const entity of entities) {
    const normalized = normalizeEntityName(entity.name);
    const candidates = [normalized, ...(entity.aliases ?? []).map(normalizeEntityName)];
    let match: { id: string; name: string; entityType: string } | null = null;

    for (const key of candidates) {
      const found = byNormalized.get(key);
      if (found && found.entityType === entity.entityType) {
        match = found;
        break;
      }
    }

    if (!match) {
      resolved.push({
        name: entity.name,
        normalizedName: normalized,
        entityType: entity.entityType,
        existingEntityId: null,
        mergeSuggestionId: null,
        confidence: entity.confidence,
        aliases: entity.aliases ?? [],
      });
      continue;
    }

    if (
      entity.confidence >= AUTO_MERGE_THRESHOLD &&
      normalizeEntityName(match.name) === normalized
    ) {
      resolved.push({
        name: match.name,
        normalizedName: normalized,
        entityType: entity.entityType,
        existingEntityId: match.id,
        mergeSuggestionId: null,
        confidence: entity.confidence,
        aliases: entity.aliases ?? [],
      });
      continue;
    }

    if (normalizeEntityName(match.name) !== normalized) {
      const { data: suggestion } = await supabase
        .from("guardian_knowledge_entity_merge_suggestions")
        .upsert(
          {
            profile_id: profileId,
            owner_user_id: userId,
            source_entity_id: match.id,
            target_entity_id: match.id,
            confidence: entity.confidence,
            reason: `Alias candidate: ${entity.name}`,
            status: "pending",
          },
          { onConflict: "source_entity_id,target_entity_id", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      resolved.push({
        name: entity.name,
        normalizedName: normalized,
        entityType: entity.entityType,
        existingEntityId: match.id,
        mergeSuggestionId: suggestion?.id ?? null,
        confidence: entity.confidence,
        aliases: entity.aliases ?? [],
      });
    } else {
      resolved.push({
        name: entity.name,
        normalizedName: normalized,
        entityType: entity.entityType,
        existingEntityId: match.id,
        mergeSuggestionId: null,
        confidence: entity.confidence,
        aliases: entity.aliases ?? [],
      });
    }
  }

  return resolved;
}
