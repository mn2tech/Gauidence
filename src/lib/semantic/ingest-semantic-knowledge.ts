import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { semanticConfidenceThreshold } from "@/lib/features/semantic-layer";
import { extractSemanticKnowledge } from "./extract-semantic-knowledge";
import { resolveEntity } from "./resolve-entity";
import { truncateExcerpt } from "./normalize";
import { logSemanticEvent } from "./log";
import type {
  EntityResolutionKind,
  SemanticExtractionInput,
  SemanticIngestResult,
} from "./types";

async function upsertEvidence(
  supabase: SupabaseClient,
  args: {
    userId: string;
    sourceType: string;
    sourceId: string;
    spaceId?: string | null;
    sourceTitle?: string | null;
    excerpt?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const excerpt = args.excerpt ? truncateExcerpt(args.excerpt, 500) : null;

  const { data: existing } = await supabase
    .from("semantic_evidence")
    .select("id")
    .eq("user_id", args.userId)
    .eq("source_type", args.sourceType)
    .eq("source_id", args.sourceId)
    .eq("source_excerpt", excerpt ?? "")
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // Fallback: match without excerpt equality when null/empty quirks
  if (!excerpt) {
    const { data: bySource } = await supabase
      .from("semantic_evidence")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_type", args.sourceType)
      .eq("source_id", args.sourceId)
      .is("source_excerpt", null)
      .limit(1)
      .maybeSingle();
    if (bySource?.id) return bySource.id as string;
  }

  const { data, error } = await supabase
    .from("semantic_evidence")
    .insert({
      user_id: args.userId,
      source_type: args.sourceType,
      source_id: args.sourceId,
      space_id: args.spaceId ?? null,
      source_title: args.sourceTitle ?? null,
      source_excerpt: excerpt,
      source_metadata: args.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    // Race: unique conflict — re-fetch
    const { data: again } = await supabase
      .from("semantic_evidence")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_type", args.sourceType)
      .eq("source_id", args.sourceId)
      .limit(1)
      .maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(error?.message ?? "Failed to create semantic evidence");
  }

  return data.id as string;
}

async function linkEvidence(
  supabase: SupabaseClient,
  args: {
    userId: string;
    evidenceId: string;
    objectType: "entity" | "relationship" | "fact";
    objectId: string;
  }
): Promise<boolean> {
  const { error } = await supabase.from("semantic_evidence_links").insert({
    user_id: args.userId,
    evidence_id: args.evidenceId,
    semantic_object_type: args.objectType,
    semantic_object_id: args.objectId,
  });

  if (error) {
    // Unique violation = already linked (idempotent)
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

async function upsertRelationship(
  supabase: SupabaseClient,
  args: {
    userId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidence: number;
    attributes?: Record<string, unknown>;
  }
): Promise<{ id: string; created: boolean }> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("semantic_relationships")
    .select("id, confidence, attributes")
    .eq("user_id", args.userId)
    .eq("source_entity_id", args.sourceEntityId)
    .eq("relationship_type", args.relationshipType)
    .eq("target_entity_id", args.targetEntityId)
    .maybeSingle();

  if (existing?.id) {
    const prevConf =
      typeof existing.confidence === "number" ? existing.confidence : 0;
    await supabase
      .from("semantic_relationships")
      .update({
        last_seen_at: now,
        confidence: Math.max(prevConf, args.confidence),
        attributes: {
          ...((existing.attributes as Record<string, unknown>) ?? {}),
          ...(args.attributes ?? {}),
        },
      })
      .eq("id", existing.id);
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await supabase
    .from("semantic_relationships")
    .insert({
      user_id: args.userId,
      source_entity_id: args.sourceEntityId,
      relationship_type: args.relationshipType,
      target_entity_id: args.targetEntityId,
      attributes: args.attributes ?? {},
      confidence: args.confidence,
      first_seen_at: now,
      last_seen_at: now,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const { data: again } = await supabase
        .from("semantic_relationships")
        .select("id")
        .eq("user_id", args.userId)
        .eq("source_entity_id", args.sourceEntityId)
        .eq("relationship_type", args.relationshipType)
        .eq("target_entity_id", args.targetEntityId)
        .maybeSingle();
      if (again?.id) return { id: again.id as string, created: false };
    }
    throw new Error(error?.message ?? "Failed to create semantic relationship");
  }

  return { id: data.id as string, created: true };
}

async function upsertFact(
  supabase: SupabaseClient,
  args: {
    userId: string;
    subjectEntityId: string | null;
    predicate: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueDate?: string | null;
    valueJson?: Record<string, unknown> | null;
    confidence: number;
  }
): Promise<{ id: string; created: boolean }> {
  let query = supabase
    .from("semantic_facts")
    .select("id")
    .eq("user_id", args.userId)
    .eq("predicate", args.predicate)
    .eq("status", "active");

  if (args.subjectEntityId) {
    query = query.eq("subject_entity_id", args.subjectEntityId);
  } else {
    query = query.is("subject_entity_id", null);
  }

  if (args.valueText != null) query = query.eq("value_text", args.valueText);
  if (args.valueNumber != null) query = query.eq("value_number", args.valueNumber);
  if (args.valueDate != null) query = query.eq("value_date", args.valueDate);

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) {
    await supabase
      .from("semantic_facts")
      .update({ confidence: args.confidence })
      .eq("id", existing.id);
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await supabase
    .from("semantic_facts")
    .insert({
      user_id: args.userId,
      subject_entity_id: args.subjectEntityId,
      predicate: args.predicate,
      value_text: args.valueText ?? null,
      value_number: args.valueNumber ?? null,
      value_date: args.valueDate ?? null,
      value_json: args.valueJson ?? null,
      confidence: args.confidence,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { id: "duplicate", created: false };
    }
    throw new Error(error?.message ?? "Failed to create semantic fact");
  }

  return { id: data.id as string, created: true };
}

/**
 * content → extract → resolve → upsert entities/relationships/facts → evidence.
 * Idempotent enough that reprocessing the same source does not explode the graph.
 */
export async function ingestSemanticKnowledge(
  supabase: SupabaseClient,
  input: SemanticExtractionInput
): Promise<SemanticIngestResult> {
  const threshold = semanticConfidenceThreshold();
  const result: SemanticIngestResult = {
    entitiesCreated: 0,
    entitiesResolved: 0,
    relationshipsUpserted: 0,
    factsUpserted: 0,
    evidenceCreated: 0,
    evidenceLinksCreated: 0,
    resolutions: [],
    warnings: [],
    skipped: false,
  };

  if (!input.content.trim()) {
    result.skipped = true;
    result.warnings.push("empty_content");
    return result;
  }

  const extraction = await extractSemanticKnowledge(input);
  result.warnings.push(...extraction.warnings);

  const tempToEntityId = new Map<string, string>();
  const defaultExcerpt = truncateExcerpt(input.content, 400);

  for (const entity of extraction.entities) {
    if (entity.confidence < threshold) {
      result.warnings.push(
        `Skipped low-confidence entity ${entity.name} (${entity.confidence})`
      );
      continue;
    }

    const resolved = await resolveEntity(supabase, input.userId, {
      type: entity.type,
      name: entity.name,
      aliases: entity.aliases,
      description: entity.description,
      attributes: entity.attributes,
      confidence: entity.confidence,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });

    tempToEntityId.set(entity.temporaryId, resolved.entity.id);
    result.resolutions.push({
      name: entity.name,
      resolution: resolved.resolution,
      entityId: resolved.entity.id,
    });

    if (resolved.resolution === "created") result.entitiesCreated += 1;
    else result.entitiesResolved += 1;

    const evidenceId = await upsertEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: defaultExcerpt,
    });
    result.evidenceCreated += 1;

    const linked = await linkEvidence(supabase, {
      userId: input.userId,
      evidenceId,
      objectType: "entity",
      objectId: resolved.entity.id,
    });
    if (linked) result.evidenceLinksCreated += 1;
  }

  for (const rel of extraction.relationships) {
    if (rel.confidence < threshold) continue;
    const sourceId = tempToEntityId.get(rel.source);
    const targetId = tempToEntityId.get(rel.target);
    if (!sourceId || !targetId) continue;

    const upserted = await upsertRelationship(supabase, {
      userId: input.userId,
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: rel.type,
      confidence: rel.confidence,
      attributes: {
        ...(rel.attributes ?? {}),
        source_id: input.sourceId,
      },
    });
    result.relationshipsUpserted += 1;

    const evidenceId = await upsertEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: rel.evidence
        ? truncateExcerpt(rel.evidence, 500)
        : defaultExcerpt,
    });

    const linked = await linkEvidence(supabase, {
      userId: input.userId,
      evidenceId,
      objectType: "relationship",
      objectId: upserted.id,
    });
    if (linked) result.evidenceLinksCreated += 1;
  }

  for (const fact of extraction.facts) {
    if (fact.confidence < threshold) continue;
    const subjectId = fact.subject
      ? tempToEntityId.get(fact.subject) ?? null
      : null;

    const upserted = await upsertFact(supabase, {
      userId: input.userId,
      subjectEntityId: subjectId,
      predicate: fact.predicate,
      valueText: fact.valueText ?? null,
      valueNumber: fact.valueNumber ?? null,
      valueDate: fact.valueDate ?? null,
      valueJson: fact.valueJson ?? null,
      confidence: fact.confidence,
    });

    if (upserted.id === "duplicate") continue;
    result.factsUpserted += 1;

    const evidenceId = await upsertEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: fact.evidence
        ? truncateExcerpt(fact.evidence, 500)
        : defaultExcerpt,
    });

    const linked = await linkEvidence(supabase, {
      userId: input.userId,
      evidenceId,
      objectType: "fact",
      objectId: upserted.id,
    });
    if (linked) result.evidenceLinksCreated += 1;
  }

  // Open-commitment actions → facts when clearly supported
  for (const action of extraction.actions) {
    if (action.confidence < threshold) continue;
    if (
      !/commit|follow.?up|assign|promise|todo|task/i.test(
        `${action.type} ${action.description}`
      )
    ) {
      continue;
    }
    const upserted = await upsertFact(supabase, {
      userId: input.userId,
      subjectEntityId: null,
      predicate: "open_commitment",
      valueText: action.description.slice(0, 500),
      confidence: action.confidence,
    });
    if (upserted.id === "duplicate") continue;
    result.factsUpserted += 1;

    const evidenceId = await upsertEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: truncateExcerpt(action.description, 500),
    });
    const linked = await linkEvidence(supabase, {
      userId: input.userId,
      evidenceId,
      objectType: "fact",
      objectId: upserted.id,
    });
    if (linked) result.evidenceLinksCreated += 1;
  }

  logSemanticEvent("semantic_ingestion_completed", {
    user_id: input.userId,
    source_id: input.sourceId,
    entities_created: result.entitiesCreated,
    entities_resolved: result.entitiesResolved,
    relationships: result.relationshipsUpserted,
    facts: result.factsUpserted,
    evidence_links: result.evidenceLinksCreated,
    resolutions: result.resolutions.length,
  });

  return result;
}

export type { EntityResolutionKind };
