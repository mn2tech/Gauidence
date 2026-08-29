import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { semanticFuzzyMatchThreshold } from "@/lib/features/semantic-layer";
import {
  asStringArray,
  canonicalizeOrganizationKey,
  isAmbiguousPersonName,
  isFuzzyMatchAllowed,
  nameSimilarity,
  normalizeEntityName,
} from "./normalize";
import { logSemanticEvent } from "./log";
import type {
  EntityResolutionResult,
  ResolveEntityCandidate,
  SemanticEntity,
} from "./types";
import { SEMANTIC_ENTITY_SELECT } from "./types";

type AliasHistoryEntry = {
  alias: string;
  added_at: string;
  source_id?: string;
  resolution?: string;
};

function parseAliases(entity: SemanticEntity): string[] {
  return asStringArray(entity.aliases);
}

function parseAttributes(entity: SemanticEntity): Record<string, unknown> {
  return entity.attributes && typeof entity.attributes === "object"
    ? entity.attributes
    : {};
}

async function findByNormalizedName(
  supabase: SupabaseClient,
  userId: string,
  entityType: string,
  normalized: string
): Promise<SemanticEntity | null> {
  const { data } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("normalized_name", normalized)
    .maybeSingle();

  return (data as SemanticEntity | null) ?? null;
}

async function findByAlias(
  supabase: SupabaseClient,
  userId: string,
  entityType: string,
  normalized: string
): Promise<SemanticEntity | null> {
  const { data: candidates } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .limit(200);

  if (!candidates?.length) return null;

  for (const row of candidates as SemanticEntity[]) {
    const aliases = parseAliases(row).map(normalizeEntityName);
    if (aliases.includes(normalized)) return row;
    if (row.normalized_name && normalizeEntityName(row.normalized_name) === normalized) {
      return row;
    }
  }
  return null;
}

async function findByOrgSuffix(
  supabase: SupabaseClient,
  userId: string,
  entityType: string,
  name: string
): Promise<SemanticEntity | null> {
  if (entityType !== "organization" && entityType !== "agency") return null;
  const key = canonicalizeOrganizationKey(name);
  if (!key || key.length < 2) return null;

  const { data: candidates } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .limit(200);

  if (!candidates?.length) return null;

  for (const row of candidates as SemanticEntity[]) {
    const rowKey = canonicalizeOrganizationKey(
      row.canonical_name ?? row.normalized_name ?? ""
    );
    if (rowKey && rowKey === key) return row;
    for (const alias of parseAliases(row)) {
      if (canonicalizeOrganizationKey(alias) === key) return row;
    }
  }
  return null;
}

async function findByFuzzy(
  supabase: SupabaseClient,
  userId: string,
  entityType: string,
  name: string
): Promise<{ entity: SemanticEntity; score: number } | null> {
  if (!isFuzzyMatchAllowed(entityType)) return null;
  if (entityType === "person" && isAmbiguousPersonName(name)) return null;

  const { data: candidates } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .limit(100);

  if (!candidates?.length) return null;

  const threshold = semanticFuzzyMatchThreshold();
  let best: SemanticEntity | null = null;
  let bestScore = 0;
  const normalized = normalizeEntityName(name);

  for (const candidate of candidates as SemanticEntity[]) {
    const score = nameSimilarity(
      normalized,
      candidate.normalized_name ?? candidate.canonical_name
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best ? { entity: best, score: bestScore } : null;
}

async function createEntity(
  supabase: SupabaseClient,
  userId: string,
  candidate: ResolveEntityCandidate,
  normalized: string
): Promise<SemanticEntity> {
  const now = new Date().toISOString();
  const aliases = (candidate.aliases ?? [])
    .map((a) => a.trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from("semantic_entities")
    .insert({
      user_id: userId,
      canonical_name: candidate.name.trim(),
      entity_type: candidate.type,
      normalized_name: normalized,
      description: candidate.description ?? null,
      aliases,
      attributes: candidate.attributes ?? {},
      confidence: candidate.confidence ?? null,
      first_seen_at: now,
      last_seen_at: now,
    })
    .select(SEMANTIC_ENTITY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create semantic entity");
  }

  return data as SemanticEntity;
}

/**
 * Merge aliases onto an existing entity and append audit history.
 */
async function mergeAliases(
  supabase: SupabaseClient,
  entity: SemanticEntity,
  newAliases: string[],
  meta?: { sourceId?: string; resolution?: string }
): Promise<SemanticEntity> {
  const existing = parseAliases(entity);
  const existingNorm = new Set(existing.map(normalizeEntityName));
  const added: string[] = [];

  for (const alias of newAliases) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    const n = normalizeEntityName(trimmed);
    if (!n || existingNorm.has(n)) continue;
    if (n === normalizeEntityName(entity.canonical_name)) continue;
    existing.push(trimmed);
    existingNorm.add(n);
    added.push(trimmed);
  }

  // Also add the candidate display name as alias when it differs
  const display = entity.canonical_name;
  void display;

  if (added.length === 0) {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("semantic_entities")
      .update({ last_seen_at: now })
      .eq("id", entity.id)
      .select(SEMANTIC_ENTITY_SELECT)
      .maybeSingle();
    return (data as SemanticEntity | null) ?? entity;
  }

  const attrs = parseAttributes(entity);
  const history = Array.isArray(attrs.alias_history)
    ? ([...attrs.alias_history] as AliasHistoryEntry[])
    : [];
  const now = new Date().toISOString();
  for (const alias of added) {
    history.push({
      alias,
      added_at: now,
      source_id: meta?.sourceId,
      resolution: meta?.resolution,
    });
  }

  const { data, error } = await supabase
    .from("semantic_entities")
    .update({
      aliases: existing,
      attributes: { ...attrs, alias_history: history },
      last_seen_at: now,
    })
    .eq("id", entity.id)
    .select(SEMANTIC_ENTITY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update semantic entity aliases");
  }

  logSemanticEvent("semantic_entity_resolved", {
    user_id: entity.user_id,
    entity_id: entity.id,
    resolution: meta?.resolution ?? "alias_merge",
    aliases_added: added.length,
  });

  return data as SemanticEntity;
}

/**
 * Resolve a candidate entity against the user's semantic graph.
 *
 * Order: exact normalized → alias → org suffix → fuzzy → create.
 * Semantic embedding / LLM disambiguation deferred unless inexpensive infra exists.
 */
export async function resolveEntity(
  supabase: SupabaseClient,
  userId: string,
  candidate: ResolveEntityCandidate
): Promise<EntityResolutionResult> {
  const name = candidate.name.trim();
  const normalized = normalizeEntityName(name);
  if (!normalized) {
    throw new Error("Cannot resolve entity with empty name");
  }

  const extraAliases = [
    ...(candidate.aliases ?? []),
    name,
  ].filter(Boolean);

  const exact = await findByNormalizedName(
    supabase,
    userId,
    candidate.type,
    normalized
  );
  if (exact) {
    const entity = await mergeAliases(supabase, exact, extraAliases, {
      sourceId: candidate.sourceId,
      resolution: "exact",
    });
    return { entity, resolution: "exact", confidence: 1 };
  }

  const byAlias = await findByAlias(
    supabase,
    userId,
    candidate.type,
    normalized
  );
  if (byAlias) {
    const entity = await mergeAliases(supabase, byAlias, extraAliases, {
      sourceId: candidate.sourceId,
      resolution: "alias",
    });
    return { entity, resolution: "alias", confidence: 0.98 };
  }

  // Candidate aliases may match an existing canonical/alias (e.g. TTB → full name)
  for (const alias of candidate.aliases ?? []) {
    const aliasNorm = normalizeEntityName(alias);
    if (!aliasNorm || aliasNorm === normalized) continue;
    const hit =
      (await findByNormalizedName(
        supabase,
        userId,
        candidate.type,
        aliasNorm
      )) ?? (await findByAlias(supabase, userId, candidate.type, aliasNorm));
    if (hit) {
      const entity = await mergeAliases(supabase, hit, extraAliases, {
        sourceId: candidate.sourceId,
        resolution: "alias",
      });
      return { entity, resolution: "alias", confidence: 0.97 };
    }
  }

  const bySuffix = await findByOrgSuffix(
    supabase,
    userId,
    candidate.type,
    name
  );
  if (bySuffix) {
    const entity = await mergeAliases(supabase, bySuffix, extraAliases, {
      sourceId: candidate.sourceId,
      resolution: "alias",
    });
    return { entity, resolution: "alias", confidence: 0.95 };
  }

  const fuzzy = await findByFuzzy(supabase, userId, candidate.type, name);
  if (fuzzy) {
    const entity = await mergeAliases(supabase, fuzzy.entity, extraAliases, {
      sourceId: candidate.sourceId,
      resolution: "fuzzy",
    });
    return {
      entity,
      resolution: "fuzzy",
      confidence: fuzzy.score,
    };
  }

  const created = await createEntity(supabase, userId, candidate, normalized);
  logSemanticEvent("semantic_entity_resolved", {
    user_id: userId,
    entity_id: created.id,
    resolution: "created",
    entity_type: candidate.type,
  });
  return {
    entity: created,
    resolution: "created",
    confidence: candidate.confidence ?? 0.8,
  };
}
