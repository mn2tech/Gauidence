/**
 * World Engine — receives normalized extraction, resolves identity, upserts
 * with provenance, emits timeline + inbox. Idempotent.
 *
 * Facade over the Semantic Layer store (semantic_*). Does not replace ontology
 * or guardian_items.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { semanticConfidenceThreshold } from "@/lib/features/semantic-layer";
import { extractSemanticKnowledge } from "@/lib/semantic/extract-semantic-knowledge";
import { isActionableCommitmentText } from "@/lib/semantic/commitment-filter";
import { truncateExcerpt } from "@/lib/semantic/normalize";
import { logSemanticEvent } from "@/lib/semantic/log";
import type { SemanticExtractionInput } from "@/lib/semantic/types";
import { resolveWorldIdentity } from "./identityResolver";
import { attachEvidence } from "./provenance";
import { scoreEntityImportance } from "./importance";
import {
  emitWorldTimelineEntry,
  inferTimelineEntriesFromExtraction,
} from "./timeline";
import type { WorldIdentityResolution, WorldProcessResult } from "./types";

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
    throw new Error(error?.message ?? "Failed to create relationship");
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
    throw new Error(error?.message ?? "Failed to create fact");
  }

  return { id: data.id as string, created: true };
}

/**
 * Process normalized source content through the World Engine.
 */
export async function processWorldExtraction(
  supabase: SupabaseClient,
  input: SemanticExtractionInput,
  options: { createInbox?: boolean } = {}
): Promise<WorldProcessResult> {
  const threshold = semanticConfidenceThreshold();
  const result: WorldProcessResult = {
    entitiesCreated: 0,
    entitiesResolved: 0,
    relationshipsUpserted: 0,
    factsUpserted: 0,
    evidenceCreated: 0,
    evidenceLinksCreated: 0,
    resolutions: [],
    warnings: [],
    skipped: false,
    timelineCreated: 0,
    inboxCreated: 0,
    identityResolutions: [],
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
  const identityResolutions: WorldIdentityResolution[] = [];

  for (const entity of extraction.entities) {
    if (entity.confidence < threshold) {
      result.warnings.push(
        `Skipped low-confidence entity ${entity.name} (${entity.confidence})`
      );
      continue;
    }

    const resolved = await resolveWorldIdentity(
      supabase,
      input.userId,
      {
        type: entity.type,
        name: entity.name,
        aliases: entity.aliases,
        description: entity.description,
        attributes: entity.attributes,
        confidence: entity.confidence,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
      {
        spaceId: input.spaceId,
        createInbox: options.createInbox,
      }
    );

    identityResolutions.push(resolved);
    tempToEntityId.set(entity.temporaryId, resolved.entity.id);

    result.resolutions.push({
      name: entity.name,
      resolution:
        resolved.resolution === "email" ||
        resolved.resolution === "phone" ||
        resolved.resolution === "org_cooccurrence" ||
        resolved.resolution === "candidate"
          ? resolved.resolution === "candidate"
            ? "created"
            : "exact"
          : resolved.resolution === "fuzzy"
            ? "fuzzy"
            : resolved.resolution,
      entityId: resolved.entity.id,
    });

    if (
      resolved.resolution === "created" ||
      resolved.resolution === "candidate"
    ) {
      result.entitiesCreated += 1;
    } else {
      result.entitiesResolved += 1;
    }
    if (resolved.inboxCreated) result.inboxCreated += 1;

    const importance = scoreEntityImportance({
      entityType: entity.type,
      confidence: entity.confidence,
      relationshipDegree: 0,
      factCount: 0,
    });
    await supabase
      .from("semantic_entities")
      .update({ importance_score: importance })
      .eq("id", resolved.entity.id);

    const attached = await attachEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: defaultExcerpt,
      objectType: "entity",
      objectId: resolved.entity.id,
    });
    result.evidenceCreated += 1;
    if (attached.linked) result.evidenceLinksCreated += 1;
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

    const excerpt = requireRelExcerpt(rel.evidence, defaultExcerpt);
    const attached = await attachEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt,
      objectType: "relationship",
      objectId: upserted.id,
    });
    if (attached.linked) result.evidenceLinksCreated += 1;
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

    const excerpt = requireRelExcerpt(fact.evidence, defaultExcerpt);
    const attached = await attachEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt,
      objectType: "fact",
      objectId: upserted.id,
    });
    if (attached.linked) result.evidenceLinksCreated += 1;
  }

  for (const action of extraction.actions) {
    if (action.confidence < threshold) continue;
    if (
      !/commit|follow.?up|assign|promise|todo|task/i.test(
        `${action.type} ${action.description}`
      )
    ) {
      continue;
    }
    if (!isActionableCommitmentText(action.description)) continue;

    const upserted = await upsertFact(supabase, {
      userId: input.userId,
      subjectEntityId: null,
      predicate: "open_commitment",
      valueText: action.description.slice(0, 500),
      confidence: action.confidence,
    });
    if (upserted.id === "duplicate") continue;
    result.factsUpserted += 1;

    const attached = await attachEvidence(supabase, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      spaceId: input.spaceId,
      sourceTitle: input.sourceTitle,
      excerpt: truncateExcerpt(action.description, 500),
      objectType: "fact",
      objectId: upserted.id,
    });
    if (attached.linked) result.evidenceLinksCreated += 1;
  }

  const timelineCandidates = inferTimelineEntriesFromExtraction({
    extraction,
    sourceId: input.sourceId,
    sourceTitle: input.sourceTitle,
    tempToEntityId,
  });

  for (const candidate of timelineCandidates) {
    const emitted = await emitWorldTimelineEntry(supabase, {
      userId: input.userId,
      spaceId: input.spaceId,
      candidate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    if (emitted?.created) result.timelineCreated += 1;
  }

  result.identityResolutions = identityResolutions;

  logSemanticEvent("world_engine_completed", {
    user_id: input.userId,
    source_id: input.sourceId,
    entities_created: result.entitiesCreated,
    entities_resolved: result.entitiesResolved,
    relationships: result.relationshipsUpserted,
    facts: result.factsUpserted,
    timeline: result.timelineCreated,
    inbox: result.inboxCreated,
  });

  try {
    const { evaluateWorldWatchRules } = await import("./watch");
    await evaluateWorldWatchRules(supabase, input.userId, {
      spaceId: input.spaceId ?? undefined,
    });
  } catch (err) {
    console.error(
      "World watch after engine failed (non-blocking):",
      err instanceof Error ? err.message : err
    );
  }

  return result;
}

function requireRelExcerpt(
  evidence: string | undefined,
  fallback: string
): string {
  const e = evidence?.trim();
  if (e) return truncateExcerpt(e, 500);
  if (!fallback.trim()) {
    throw new Error("Evidence excerpt required for world fact/relationship");
  }
  return truncateExcerpt(fallback, 500);
}
