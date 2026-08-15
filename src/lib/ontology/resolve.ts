import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAmbiguousPersonName,
  isFuzzyMatchAllowed,
  nameSimilarity,
  normalizeEntityName,
  canonicalizeOrganizationKey,
  extractDomainHint,
} from "./normalize";
import type {
  EntityResolutionResult,
  OntologyEntity,
  OntologySourceType,
} from "./types";
import { ONTOLOGY_ENTITY_SELECT, reviewStatusForConfidence } from "./types";
import { ontologyFuzzyMatchThreshold } from "@/lib/features/ontology";

export type ResolveOntologyEntityInput = {
  spaceId: string;
  entityType: string;
  name: string;
  aliases?: string[];
  confidence?: number;
  sourceType?: OntologySourceType;
  sourceId?: string;
  createdBy?: string;
  description?: string;
  properties?: Record<string, unknown>;
};

export { canonicalizeOrganizationKey, extractDomainHint };

async function findByCanonicalName(
  supabase: SupabaseClient,
  profileId: string,
  entityType: string,
  normalized: string
): Promise<OntologyEntity | null> {
  const { data } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("profile_id", profileId)
    .eq("entity_type", entityType)
    .eq("canonical_name", normalized)
    .neq("review_status", "rejected")
    .maybeSingle();

  return (data as OntologyEntity | null) ?? null;
}

async function findByAlias(
  supabase: SupabaseClient,
  profileId: string,
  normalized: string
): Promise<OntologyEntity | null> {
  const { data: aliasRow } = await supabase
    .from("ontology_entity_aliases")
    .select("entity_id")
    .eq("profile_id", profileId)
    .eq("normalized_alias", normalized)
    .maybeSingle();

  if (!aliasRow?.entity_id) return null;

  const { data } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("id", aliasRow.entity_id)
    .neq("review_status", "rejected")
    .maybeSingle();

  return (data as OntologyEntity | null) ?? null;
}

async function findByFuzzyMatch(
  supabase: SupabaseClient,
  profileId: string,
  entityType: string,
  normalized: string,
  displayName: string
): Promise<OntologyEntity | null> {
  if (!isFuzzyMatchAllowed(entityType)) return null;
  if (entityType === "person" && isAmbiguousPersonName(displayName)) return null;

  const { data: candidates } = await supabase
    .from("ontology_entities")
    .select(ONTOLOGY_ENTITY_SELECT)
    .eq("profile_id", profileId)
    .eq("entity_type", entityType)
    .neq("review_status", "rejected")
    .limit(50);

  if (!candidates?.length) return null;

  const threshold = ontologyFuzzyMatchThreshold();
  let best: OntologyEntity | null = null;
  let bestScore = 0;

  for (const candidate of candidates as OntologyEntity[]) {
    const score = nameSimilarity(
      normalized,
      candidate.canonical_name ?? candidate.name
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

async function createEntity(
  supabase: SupabaseClient,
  input: ResolveOntologyEntityInput,
  normalized: string
): Promise<OntologyEntity> {
  const { data, error } = await supabase
    .from("ontology_entities")
    .insert({
      profile_id: input.spaceId,
      entity_type: input.entityType,
      name: input.name.trim(),
      canonical_name: normalized,
      description: input.description ?? null,
      properties: input.properties ?? {},
      confidence: input.confidence ?? null,
      review_status: reviewStatusForConfidence(
        input.confidence,
        input.sourceType
      ),
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(ONTOLOGY_ENTITY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create ontology entity");
  }

  return data as OntologyEntity;
}

async function ensureAliases(
  supabase: SupabaseClient,
  profileId: string,
  entityId: string,
  aliases: string[],
  canonicalNormalized: string
): Promise<void> {
  const unique = new Set<string>();
  for (const alias of aliases) {
    const normalized = normalizeEntityName(alias);
    if (!normalized || normalized === canonicalNormalized) continue;
    unique.add(normalized);
  }

  if (!unique.size) return;

  const rows = [...unique].map((normalized) => ({
    profile_id: profileId,
    entity_id: entityId,
    alias: aliases.find((a) => normalizeEntityName(a) === normalized) ?? normalized,
    normalized_alias: normalized,
  }));

  await supabase
    .from("ontology_entity_aliases")
    .upsert(rows, { onConflict: "profile_id,normalized_alias", ignoreDuplicates: true });
}

/**
 * Resolve an ontology entity within a Space (profile).
 * Checks canonical name → aliases → conservative fuzzy match → create new.
 */
export async function resolveOntologyEntity(
  supabase: SupabaseClient,
  input: ResolveOntologyEntityInput
): Promise<EntityResolutionResult> {
  const normalized = normalizeEntityName(input.name);
  if (!normalized) {
    throw new Error("Entity name is required");
  }

  const canonical = await findByCanonicalName(
    supabase,
    input.spaceId,
    input.entityType,
    normalized
  );
  if (canonical) {
    if (input.aliases?.length) {
      await ensureAliases(
        supabase,
        input.spaceId,
        canonical.id,
        input.aliases,
        normalized
      );
    }
    const entity = await mergeEntityProperties(
      supabase,
      canonical,
      input.properties,
      input.description
    );
    return { entity, created: false, matchType: "canonical" };
  }

  const byAlias = await findByAlias(supabase, input.spaceId, normalized);
  if (byAlias) {
    if (input.aliases?.length) {
      await ensureAliases(
        supabase,
        input.spaceId,
        byAlias.id,
        input.aliases,
        byAlias.canonical_name ?? normalized
      );
    }
    const entity = await mergeEntityProperties(
      supabase,
      byAlias,
      withDomainProperty(input),
      input.description
    );
    return { entity, created: false, matchType: "alias" };
  }

  // Organization/client: Proxdose ≈ Proxdose LLC ≈ proxdose.com (single unambiguous hit only)
  if (
    input.entityType === "organization" ||
    input.entityType === "client"
  ) {
    const orgKey = canonicalizeOrganizationKey(input.name);
    const domain = extractDomainHint(input.name);
    if (orgKey && orgKey !== normalized) {
      const byOrgKey = await findByCanonicalName(
        supabase,
        input.spaceId,
        input.entityType,
        orgKey
      );
      if (byOrgKey) {
        await ensureAliases(
          supabase,
          input.spaceId,
          byOrgKey.id,
          [input.name, ...(input.aliases ?? []), ...(domain ? [domain] : [])],
          byOrgKey.canonical_name ?? orgKey
        );
        const entity = await mergeEntityProperties(
          supabase,
          byOrgKey,
          withDomainProperty(input),
          input.description
        );
        return { entity, created: false, matchType: "alias" };
      }
      const byOrgAlias = await findByAlias(supabase, input.spaceId, orgKey);
      if (byOrgAlias) {
        await ensureAliases(
          supabase,
          input.spaceId,
          byOrgAlias.id,
          [input.name, ...(input.aliases ?? []), ...(domain ? [domain] : [])],
          byOrgAlias.canonical_name ?? orgKey
        );
        const entity = await mergeEntityProperties(
          supabase,
          byOrgAlias,
          withDomainProperty(input),
          input.description
        );
        return { entity, created: false, matchType: "alias" };
      }
    }
    if (domain) {
      const byDomainAlias = await findByAlias(supabase, input.spaceId, domain);
      if (byDomainAlias) {
        await ensureAliases(
          supabase,
          input.spaceId,
          byDomainAlias.id,
          [input.name, ...(input.aliases ?? []), domain],
          byDomainAlias.canonical_name ?? normalized
        );
        const entity = await mergeEntityProperties(
          supabase,
          byDomainAlias,
          withDomainProperty(input),
          input.description
        );
        return { entity, created: false, matchType: "alias" };
      }
    }
  }

  const fuzzy = await findByFuzzyMatch(
    supabase,
    input.spaceId,
    input.entityType,
    normalized,
    input.name
  );
  if (fuzzy) {
    if (input.aliases?.length) {
      await ensureAliases(
        supabase,
        input.spaceId,
        fuzzy.id,
        [input.name, ...input.aliases],
        fuzzy.canonical_name ?? normalized
      );
    }
    const entity = await mergeEntityProperties(
      supabase,
      fuzzy,
      withDomainProperty(input),
      input.description
    );
    return { entity, created: false, matchType: "fuzzy" };
  }

  const createInput = {
    ...input,
    properties: withDomainProperty(input),
  };
  const entity = await createEntity(supabase, createInput, normalized);
  const domain = extractDomainHint(input.name);
  const allAliases = [
    input.name,
    ...(input.aliases ?? []),
    ...(domain ? [domain] : []),
  ];
  await ensureAliases(supabase, input.spaceId, entity.id, allAliases, normalized);

  return { entity, created: true, matchType: "created" };
}

function withDomainProperty(
  input: ResolveOntologyEntityInput
): Record<string, unknown> | undefined {
  const domain = extractDomainHint(input.name);
  if (!domain && !input.properties) return input.properties;
  return {
    ...(input.properties ?? {}),
    ...(domain ? { domain } : {}),
  };
}

async function mergeEntityProperties(
  supabase: SupabaseClient,
  entity: OntologyEntity,
  properties?: Record<string, unknown>,
  description?: string
): Promise<OntologyEntity> {
  const nextProps = {
    ...(entity.properties ?? {}),
    ...(properties ?? {}),
  };
  const nextDescription =
    description && description.trim()
      ? description.trim()
      : entity.description;

  const propsChanged =
    JSON.stringify(entity.properties ?? {}) !== JSON.stringify(nextProps);
  const descChanged = nextDescription !== entity.description;

  if (!propsChanged && !descChanged) return entity;

  const { data } = await supabase
    .from("ontology_entities")
    .update({
      properties: nextProps,
      description: nextDescription,
    })
    .eq("id", entity.id)
    .select(ONTOLOGY_ENTITY_SELECT)
    .maybeSingle();

  return (data as OntologyEntity | null) ?? { ...entity, properties: nextProps, description: nextDescription };
}
