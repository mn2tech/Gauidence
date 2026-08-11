import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOntologyEntity } from "./resolve";
import { normalizeEntityName } from "./normalize";
import type {
  OntologyExtractionResult,
  OntologyPersistStats,
} from "./types";
import { reviewStatusForConfidence } from "./types";

export type PersistOntologyInput = {
  userId: string;
  profileId: string;
  documentId: string;
  fileName: string;
  extraction: OntologyExtractionResult;
};

export async function persistOntologyExtraction(
  supabase: SupabaseClient,
  input: PersistOntologyInput
): Promise<OntologyPersistStats> {
  const stats: OntologyPersistStats = {
    entitiesCreated: 0,
    entitiesMatched: 0,
    relationshipsCreated: 0,
    evidenceCreated: 0,
    eventsCreated: 0,
  };

  const entityNameMap = new Map<string, string>();

  const docEntity = await resolveOntologyEntity(supabase, {
    spaceId: input.profileId,
    entityType: "document",
    name: input.fileName,
    sourceType: "document",
    sourceId: input.documentId,
    createdBy: input.userId,
    confidence: 1,
  });
  if (docEntity.created) stats.entitiesCreated += 1;
  else stats.entitiesMatched += 1;
  entityNameMap.set(normalizeEntityName(input.fileName), docEntity.entity.id);

  for (const extracted of input.extraction.entities) {
    const key = normalizeEntityName(extracted.name);
    if (!key) continue;

    const result = await resolveOntologyEntity(supabase, {
      spaceId: input.profileId,
      entityType: extracted.type,
      name: extracted.name,
      aliases: extracted.aliases,
      description: extracted.description,
      confidence: extracted.confidence,
      sourceType: "document",
      sourceId: input.documentId,
      createdBy: input.userId,
    });

    entityNameMap.set(key, result.entity.id);
    if (result.created) stats.entitiesCreated += 1;
    else stats.entitiesMatched += 1;

    await supabase.from("ontology_evidence").insert({
      profile_id: input.profileId,
      entity_id: result.entity.id,
      source_type: "document",
      source_id: input.documentId,
      document_id: input.documentId,
      evidence_text: extracted.description ?? `Entity "${extracted.name}" mentioned in document.`,
      confidence: extracted.confidence,
    });
    stats.evidenceCreated += 1;

    await ensureDocumentRelationship(
      supabase,
      input,
      result.entity.id,
      docEntity.entity.id,
      "MENTIONED_IN",
      extracted.confidence,
      `Entity "${extracted.name}" appears in ${input.fileName}.`,
      stats
    );
  }

  for (const rel of input.extraction.relationships) {
    const sourceKey = normalizeEntityName(rel.source);
    const targetKey = normalizeEntityName(rel.target);
    let sourceId = entityNameMap.get(sourceKey);
    let targetId = entityNameMap.get(targetKey);

    if (!sourceId) {
      const resolved = await resolveOntologyEntity(supabase, {
        spaceId: input.profileId,
        entityType: "organization",
        name: rel.source,
        sourceType: "document",
        sourceId: input.documentId,
        createdBy: input.userId,
        confidence: rel.confidence,
      });
      sourceId = resolved.entity.id;
      entityNameMap.set(sourceKey, sourceId);
      if (resolved.created) stats.entitiesCreated += 1;
      else stats.entitiesMatched += 1;
    }

    if (!targetId) {
      const resolved = await resolveOntologyEntity(supabase, {
        spaceId: input.profileId,
        entityType: "organization",
        name: rel.target,
        sourceType: "document",
        sourceId: input.documentId,
        createdBy: input.userId,
        confidence: rel.confidence,
      });
      targetId = resolved.entity.id;
      entityNameMap.set(targetKey, targetId);
      if (resolved.created) stats.entitiesCreated += 1;
      else stats.entitiesMatched += 1;
    }

    const relationshipId = await upsertRelationship(supabase, {
      profileId: input.profileId,
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: rel.type,
      confidence: rel.confidence,
      documentId: input.documentId,
      createdBy: input.userId,
    });

    if (relationshipId.created) stats.relationshipsCreated += 1;

    await supabase.from("ontology_evidence").insert({
      profile_id: input.profileId,
      relationship_id: relationshipId.id,
      source_type: "document",
      source_id: input.documentId,
      document_id: input.documentId,
      evidence_text: rel.evidence,
      confidence: rel.confidence,
    });
    stats.evidenceCreated += 1;
  }

  for (const event of input.extraction.events) {
    const { error } = await supabase.from("ontology_events").insert({
      profile_id: input.profileId,
      event_type: event.type,
      title: event.title,
      event_date: event.eventDate ?? null,
      source_document_id: input.documentId,
      confidence: event.confidence ?? null,
    });
    if (!error) stats.eventsCreated += 1;
  }

  return stats;
}

async function ensureDocumentRelationship(
  supabase: SupabaseClient,
  input: PersistOntologyInput,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  confidence: number,
  evidence: string,
  stats: OntologyPersistStats
): Promise<void> {
  const result = await upsertRelationship(supabase, {
    profileId: input.profileId,
    sourceEntityId,
    targetEntityId,
    relationshipType,
    confidence,
    documentId: input.documentId,
    createdBy: input.userId,
  });
  if (result.created) stats.relationshipsCreated += 1;

  await supabase.from("ontology_evidence").insert({
    profile_id: input.profileId,
    relationship_id: result.id,
    source_type: "document",
    source_id: input.documentId,
    document_id: input.documentId,
    evidence_text: evidence,
    confidence,
  });
  stats.evidenceCreated += 1;
}

async function upsertRelationship(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidence: number;
    documentId: string;
    createdBy: string;
  }
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await supabase
    .from("ontology_relationships")
    .select("id")
    .eq("profile_id", args.profileId)
    .eq("source_entity_id", args.sourceEntityId)
    .eq("target_entity_id", args.targetEntityId)
    .eq("relationship_type", args.relationshipType)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("ontology_relationships")
    .insert({
      profile_id: args.profileId,
      source_entity_id: args.sourceEntityId,
      relationship_type: args.relationshipType,
      target_entity_id: args.targetEntityId,
      confidence: args.confidence,
      review_status: reviewStatusForConfidence(
        args.confidence,
        "document",
        args.relationshipType
      ),
      source_document_id: args.documentId,
      created_by: args.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create relationship");
  }

  return { id: data.id, created: true };
}
