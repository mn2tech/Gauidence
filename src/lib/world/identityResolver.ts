/**
 * WorldIdentityResolver — confidence-banded identity resolution.
 *
 * HIGH  → auto-resolve / merge aliases
 * MEDIUM → create candidate + World Inbox (never silent merge)
 * LOW   → separate candidate (+ optional inbox)
 */

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
} from "@/lib/semantic/normalize";
import type { ResolveEntityCandidate, SemanticEntity } from "@/lib/semantic/types";
import { SEMANTIC_ENTITY_SELECT } from "@/lib/semantic/types";
import { createWorldInboxItem } from "./inbox";
import {
  extractEmailFromCandidate,
  extractPhoneFromCandidate,
} from "./identitySignals";
import type { WorldEntity, WorldIdentityResolution } from "./types";

export type ResolveWorldIdentityOptions = {
  spaceId?: string | null;
  /** When false, skip inbox writes (tests / dry-run). Default true. */
  createInbox?: boolean;
};

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

function extractEmail(candidate: ResolveEntityCandidate): string | null {
  return extractEmailFromCandidate({
    attributes: candidate.attributes,
    aliases: candidate.aliases,
  });
}

function extractPhone(candidate: ResolveEntityCandidate): string | null {
  return extractPhoneFromCandidate({ attributes: candidate.attributes });
}

function extractOrgHint(candidate: ResolveEntityCandidate): string | null {
  const attrs = candidate.attributes ?? {};
  for (const key of ["organization", "org", "company", "works_at"]) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim()) return normalizeEntityName(v);
  }
  return null;
}

function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

async function loadTypeCandidates(
  supabase: SupabaseClient,
  userId: string,
  entityType: string
): Promise<SemanticEntity[]> {
  const { data } = await supabase
    .from("semantic_entities")
    .select(SEMANTIC_ENTITY_SELECT)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .in("status", ["active", "candidate"])
    .limit(300);
  return (data ?? []) as SemanticEntity[];
}

async function findByEmail(
  candidates: SemanticEntity[],
  email: string
): Promise<SemanticEntity | null> {
  for (const row of candidates) {
    const attrs = parseAttributes(row);
    const rowEmail =
      typeof attrs.email === "string" ? attrs.email.trim().toLowerCase() : null;
    if (rowEmail && rowEmail === email) return row;
    for (const alias of parseAliases(row)) {
      if (alias.trim().toLowerCase() === email) return row;
    }
  }
  return null;
}

async function findByPhone(
  candidates: SemanticEntity[],
  phone: string
): Promise<SemanticEntity | null> {
  for (const row of candidates) {
    const attrs = parseAttributes(row);
    const raw = typeof attrs.phone === "string" ? attrs.phone : null;
    if (raw && raw.replace(/\D/g, "") === phone) return row;
  }
  return null;
}

function findByNormalized(
  candidates: SemanticEntity[],
  normalized: string
): SemanticEntity | null {
  for (const row of candidates) {
    if (row.normalized_name === normalized) return row;
    if (normalizeEntityName(row.canonical_name) === normalized) return row;
  }
  return null;
}

function findByAlias(
  candidates: SemanticEntity[],
  normalized: string
): SemanticEntity | null {
  for (const row of candidates) {
    for (const alias of parseAliases(row)) {
      if (normalizeEntityName(alias) === normalized) return row;
    }
  }
  return null;
}

function findByOrgSuffix(
  candidates: SemanticEntity[],
  entityType: string,
  name: string
): SemanticEntity | null {
  if (entityType !== "organization" && entityType !== "agency") return null;
  const key = canonicalizeOrganizationKey(name);
  if (!key || key.length < 2) return null;
  for (const row of candidates) {
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

function findByNameAndOrg(
  candidates: SemanticEntity[],
  normalizedName: string,
  orgHint: string
): SemanticEntity | null {
  const nameParts = normalizedName.split(" ").filter(Boolean);
  if (nameParts.length < 2) return null;

  for (const row of candidates) {
    const rowNorm = row.normalized_name ?? normalizeEntityName(row.canonical_name);
    if (nameSimilarity(normalizedName, rowNorm) < 0.9) continue;
    const attrs = parseAttributes(row);
    const rowOrg = extractOrgFromAttrs(attrs);
    if (rowOrg && (rowOrg === orgHint || nameSimilarity(rowOrg, orgHint) >= 0.9)) {
      return row;
    }
  }
  return null;
}

function extractOrgFromAttrs(attrs: Record<string, unknown>): string | null {
  for (const key of ["organization", "org", "company", "works_at"]) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim()) return normalizeEntityName(v);
  }
  return null;
}

function findFuzzy(
  candidates: SemanticEntity[],
  entityType: string,
  name: string
): { entity: SemanticEntity; score: number } | null {
  if (!isFuzzyMatchAllowed(entityType) && entityType !== "person") return null;
  if (entityType === "person" && isAmbiguousPersonName(name)) return null;

  const threshold = semanticFuzzyMatchThreshold();
  // People fuzzy needs slightly higher bar for auto; medium band uses lower
  const personThreshold = Math.max(threshold, 0.88);
  const effective =
    entityType === "person" ? personThreshold : threshold;

  let best: SemanticEntity | null = null;
  let bestScore = 0;
  const normalized = normalizeEntityName(name);

  for (const candidate of candidates) {
    const score = nameSimilarity(
      normalized,
      candidate.normalized_name ?? candidate.canonical_name
    );
    if (score >= effective && score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  // Also catch medium-band fuzzy (0.75–threshold) for people
  if (!best && entityType === "person") {
    for (const candidate of candidates) {
      const score = nameSimilarity(
        normalized,
        candidate.normalized_name ?? candidate.canonical_name
      );
      if (score >= 0.75 && score < effective && score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) return { entity: best, score: bestScore };
    return null;
  }

  return best ? { entity: best, score: bestScore } : null;
}

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

  const now = new Date().toISOString();
  if (added.length === 0) {
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
      status: "active",
    })
    .eq("id", entity.id)
    .select(SEMANTIC_ENTITY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update entity aliases");
  }
  return data as SemanticEntity;
}

async function createEntity(
  supabase: SupabaseClient,
  userId: string,
  candidate: ResolveEntityCandidate,
  normalized: string,
  status: "active" | "candidate"
): Promise<SemanticEntity> {
  const now = new Date().toISOString();
  const aliases = (candidate.aliases ?? [])
    .map((a) => a.trim())
    .filter(Boolean);

  const attrs = { ...(candidate.attributes ?? {}) };
  const email = extractEmail(candidate);
  const phone = extractPhone(candidate);
  if (email) attrs.email = email;
  if (phone) attrs.phone = phone;

  const { data, error } = await supabase
    .from("semantic_entities")
    .insert({
      user_id: userId,
      canonical_name: candidate.name.trim(),
      entity_type: candidate.type,
      normalized_name: normalized,
      description: candidate.description ?? null,
      aliases,
      attributes: attrs,
      confidence: candidate.confidence ?? null,
      first_seen_at: now,
      last_seen_at: now,
      status,
    })
    .select(SEMANTIC_ENTITY_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create world entity");
  }
  return data as SemanticEntity;
}

/**
 * Resolve a candidate against the user's world graph with confidence bands.
 */
export async function resolveWorldIdentity(
  supabase: SupabaseClient,
  userId: string,
  candidate: ResolveEntityCandidate,
  options: ResolveWorldIdentityOptions = {}
): Promise<WorldIdentityResolution> {
  const name = candidate.name.trim();
  const normalized = normalizeEntityName(name);
  if (!normalized) {
    throw new Error("Cannot resolve entity with empty name");
  }

  const createInbox = options.createInbox !== false;
  const extraAliases = [...(candidate.aliases ?? []), name].filter(Boolean);
  const email = extractEmail(candidate);
  const phone = extractPhone(candidate);
  const orgHint = extractOrgHint(candidate);
  const typeCandidates = await loadTypeCandidates(
    supabase,
    userId,
    candidate.type
  );

  const finishHigh = async (
    hit: SemanticEntity,
    resolution: WorldIdentityResolution["resolution"],
    confidence: number
  ): Promise<WorldIdentityResolution> => {
    const entity = await mergeAliases(supabase, hit, extraAliases, {
      sourceId: candidate.sourceId,
      resolution,
    });
    // Persist email/phone onto attributes when HIGH
    if (email || phone) {
      const attrs = parseAttributes(entity);
      const patch: Record<string, unknown> = { ...attrs };
      if (email) patch.email = email;
      if (phone) patch.phone = phone;
      await supabase
        .from("semantic_entities")
        .update({ attributes: patch, status: "active" })
        .eq("id", entity.id);
    }
    return {
      entity: entity as WorldEntity,
      band: "high",
      resolution,
      confidence,
    };
  };

  // --- HIGH: exact email ---
  if (email) {
    const byEmail = await findByEmail(typeCandidates, email);
    if (byEmail) return finishHigh(byEmail, "email", 1);
  }

  // --- HIGH: exact phone ---
  if (phone) {
    const byPhone = await findByPhone(typeCandidates, phone);
    if (byPhone) return finishHigh(byPhone, "phone", 0.99);
  }

  // --- HIGH: exact normalized ---
  const exact = findByNormalized(typeCandidates, normalized);
  if (exact) return finishHigh(exact, "exact", 1);

  // --- HIGH: alias ---
  const byAlias = findByAlias(typeCandidates, normalized);
  if (byAlias) return finishHigh(byAlias, "alias", 0.98);

  for (const alias of candidate.aliases ?? []) {
    const aliasNorm = normalizeEntityName(alias);
    if (!aliasNorm || aliasNorm === normalized) continue;
    const hit =
      findByNormalized(typeCandidates, aliasNorm) ??
      findByAlias(typeCandidates, aliasNorm);
    if (hit) return finishHigh(hit, "alias", 0.97);
  }

  // --- HIGH: org suffix ---
  const bySuffix = findByOrgSuffix(typeCandidates, candidate.type, name);
  if (bySuffix) return finishHigh(bySuffix, "alias", 0.95);

  // --- HIGH: name + organization co-occurrence ---
  if (orgHint && candidate.type === "person") {
    const byOrg = findByNameAndOrg(typeCandidates, normalized, orgHint);
    if (byOrg) return finishHigh(byOrg, "org_cooccurrence", 0.94);
  }

  // Domain hint: same email domain + strong name similarity (HIGH if very strong)
  if (email && candidate.type === "person") {
    const domain = emailDomain(email);
    if (domain) {
      for (const row of typeCandidates) {
        const attrs = parseAttributes(row);
        const rowEmail =
          typeof attrs.email === "string"
            ? attrs.email.trim().toLowerCase()
            : null;
        if (!rowEmail || emailDomain(rowEmail) !== domain) continue;
        const score = nameSimilarity(
          normalized,
          row.normalized_name ?? row.canonical_name
        );
        if (score >= 0.92) return finishHigh(row, "org_cooccurrence", 0.93);
      }
    }
  }

  // --- LOW: ambiguous person first name only ---
  if (candidate.type === "person" && isAmbiguousPersonName(name)) {
    const created = await createEntity(
      supabase,
      userId,
      candidate,
      normalized,
      "candidate"
    );
    let inboxCreated = false;
    if (createInbox) {
      const inbox = await createWorldInboxItem(supabase, {
        userId,
        spaceId: options.spaceId,
        type: "ENTITY_CONFIRMATION",
        confidence: candidate.confidence ?? 0.4,
        semanticEntityId: created.id,
        candidate: {
          name,
          type: candidate.type,
          aliases: candidate.aliases ?? [],
          attributes: candidate.attributes ?? {},
        },
        reason: "Ambiguous person name — needs confirmation",
        dedupeKey: `ambiguous:${candidate.type}:${normalized}:${candidate.sourceId ?? "none"}`,
      });
      inboxCreated = inbox.created || Boolean(inbox.id);
    }
    return {
      entity: created as WorldEntity,
      band: "low",
      resolution: "candidate",
      confidence: candidate.confidence ?? 0.4,
      inboxCreated,
    };
  }

  // --- Fuzzy: HIGH only when score >= fuzzy threshold; else MEDIUM ---
  const fuzzy = findFuzzy(typeCandidates, candidate.type, name);
  const highThreshold = semanticFuzzyMatchThreshold();

  if (fuzzy && fuzzy.score >= highThreshold) {
    // Organizations etc. allowed to auto-merge at high fuzzy
    if (candidate.type !== "person") {
      return finishHigh(fuzzy.entity, "fuzzy", fuzzy.score);
    }
    // People: even high fuzzy → MEDIUM (never silent merge people on fuzzy alone)
  }

  if (fuzzy) {
    const created = await createEntity(
      supabase,
      userId,
      candidate,
      normalized,
      "candidate"
    );
    let inboxCreated = false;
    if (createInbox) {
      const inbox = await createWorldInboxItem(supabase, {
        userId,
        spaceId: options.spaceId,
        type: "ENTITY_MERGE",
        confidence: fuzzy.score,
        semanticEntityId: created.id,
        relatedEntityIds: [fuzzy.entity.id],
        candidate: {
          name,
          type: candidate.type,
          aliases: candidate.aliases ?? [],
          suggested_merge_into: fuzzy.entity.id,
          suggested_merge_name: fuzzy.entity.canonical_name,
        },
        reason: `Possible match for "${fuzzy.entity.canonical_name}" (score ${fuzzy.score.toFixed(2)})`,
        dedupeKey: `merge:${created.id}:${fuzzy.entity.id}`,
      });
      inboxCreated = inbox.created || Boolean(inbox.id);
    }
    return {
      entity: created as WorldEntity,
      band: "medium",
      resolution: "fuzzy",
      confidence: fuzzy.score,
      suggestedMergeEntityId: fuzzy.entity.id,
      inboxCreated,
    };
  }

  // --- No match: create active entity ---
  const created = await createEntity(
    supabase,
    userId,
    candidate,
    normalized,
    "active"
  );
  return {
    entity: created as WorldEntity,
    band: "high",
    resolution: "created",
    confidence: candidate.confidence ?? 0.8,
  };
}
