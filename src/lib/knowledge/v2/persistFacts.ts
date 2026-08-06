import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWLEDGE_EXTRACTION_VERSION } from "@/lib/features/knowledge-engine-v2";
import { reviewStatusForConfidence, shouldPersistFact } from "./confidence";
import { resolveEntities } from "./entityResolution";
import { normalizeEntityName, normalizePredicate, factDedupKey } from "./normalize";
import { relationshipKey } from "../normalize";
import type { KnowledgeExtractionResult } from "./types";

export type PersistExtractionArgs = {
  userId: string;
  profileId: string;
  documentId: string;
  sourceType: string;
  sourceId: string;
  extraction: KnowledgeExtractionResult;
};

export type PersistExtractionResult = {
  entities: number;
  facts: number;
  relationships: number;
  suggestions: number;
};

export async function persistKnowledgeExtraction(
  supabase: SupabaseClient,
  args: PersistExtractionArgs
): Promise<PersistExtractionResult> {
  const result: PersistExtractionResult = {
    entities: 0,
    facts: 0,
    relationships: 0,
    suggestions: 0,
  };
  const now = new Date().toISOString();

  const resolved = await resolveEntities(
    supabase,
    args.profileId,
    args.userId,
    args.extraction.entities,
    args.documentId
  );

  const entityIdByName = new Map<string, string>();

  for (const entity of resolved) {
    const reviewStatus =
      reviewStatusForConfidence(entity.confidence) ?? "suggested";

    if (entity.existingEntityId) {
      entityIdByName.set(normalizeEntityName(entity.name), entity.existingEntityId);
      if (entity.mergeSuggestionId) result.suggestions += 1;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("guardian_knowledge_entities")
      .upsert(
        {
          owner_user_id: args.userId,
          profile_id: args.profileId,
          entity_type: entity.entityType,
          name: entity.name,
          normalized_name: entity.normalizedName,
          source_type: args.sourceType,
          source_id: args.sourceId,
          source_document_id: args.documentId,
          confidence: entity.confidence,
          review_status: reviewStatus,
          updated_at: now,
        },
        {
          onConflict: "owner_user_id,profile_id,entity_type,normalized_name",
        }
      )
      .select("id")
      .maybeSingle();

    if (!error && inserted?.id) {
      entityIdByName.set(entity.normalizedName, inserted.id);
      result.entities += 1;

      for (const alias of entity.aliases) {
        await supabase.from("guardian_knowledge_entity_aliases").upsert(
          {
            entity_id: inserted.id,
            profile_id: args.profileId,
            alias,
            normalized_alias: normalizeEntityName(alias),
            confidence: entity.confidence,
            source_document_id: args.documentId,
          },
          { onConflict: "profile_id,normalized_alias" }
        );
      }
    }
  }

  for (const fact of args.extraction.facts) {
    if (!shouldPersistFact(fact.confidence)) continue;
    if (!fact.sourceExcerpt?.trim()) continue;

    const reviewStatus = reviewStatusForConfidence(fact.confidence) ?? "suggested";
    const objectValue = fact.value ?? fact.object ?? null;
    const dedupKey = factDedupKey({
      subject: fact.subject,
      predicate: fact.predicate,
      objectValue,
      effectiveDate: fact.effectiveDate ?? null,
    });

    const subjectNorm = normalizeEntityName(fact.subject);
    const subjectEntityId = entityIdByName.get(subjectNorm) ?? null;

    const { data: existing } = await supabase
      .from("guardian_knowledge_facts")
      .select("id, effective_date, review_status")
      .eq("profile_id", args.profileId)
      .eq("subject_name", fact.subject)
      .eq("predicate", normalizePredicate(fact.predicate))
      .neq("review_status", "superseded")
      .maybeSingle();

    if (
      existing &&
      fact.effectiveDate &&
      existing.effective_date &&
      fact.effectiveDate > existing.effective_date
    ) {
      await supabase
        .from("guardian_knowledge_facts")
        .update({
          review_status: "superseded",
          superseded_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
    }

    const { error } = await supabase.from("guardian_knowledge_facts").insert({
      owner_user_id: args.userId,
      profile_id: args.profileId,
      subject_entity_id: subjectEntityId,
      subject_name: fact.subject,
      predicate: normalizePredicate(fact.predicate),
      object_value: objectValue,
      value_type: fact.valueType ?? null,
      normalized_value: objectValue?.toLowerCase() ?? null,
      unit: fact.unit ?? null,
      effective_date: fact.effectiveDate ?? null,
      expiration_date: fact.expirationDate ?? null,
      confidence: fact.confidence,
      review_status: reviewStatus,
      source_type: args.sourceType,
      source_id: args.sourceId,
      source_document_id: args.documentId,
      source_excerpt: fact.sourceExcerpt.slice(0, 500),
      extraction_version: KNOWLEDGE_EXTRACTION_VERSION,
      metadata: { dedup_key: dedupKey },
      updated_at: now,
    });

    if (!error) result.facts += 1;
  }

  for (const rel of args.extraction.relationships) {
    if (!shouldPersistFact(rel.confidence)) continue;
    const key = relationshipKey(rel.subject, rel.relationship, rel.object);
    const { error } = await supabase
      .from("guardian_knowledge_relationships")
      .upsert(
        {
          owner_user_id: args.userId,
          profile_id: args.profileId,
          subject: rel.subject,
          relationship: rel.relationship,
          object: rel.object,
          normalized_key: key,
          source_type: args.sourceType,
          source_id: args.sourceId,
          confidence: rel.confidence,
        },
        { onConflict: "owner_user_id,profile_id,normalized_key" }
      );
    if (!error) result.relationships += 1;
  }

  return result;
}
