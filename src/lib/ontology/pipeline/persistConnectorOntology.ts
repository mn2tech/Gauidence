import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOntologyEntity } from "../resolve";
import { normalizeEntityName } from "../normalize";
import type {
  OntologyExtractionResult,
  OntologyPersistStats,
} from "../types";
import { reviewStatusForConfidence } from "../types";

export type PersistConnectorOntologyInput = {
  userId: string;
  profileId: string;
  /** source_items.id */
  sourceItemId: string;
  fileName: string;
  extraction: OntologyExtractionResult;
  analysisVersion: string;
};

/**
 * Persist ontology from a connector source item.
 * Evidence uses source_type=connector and source_id=source_items.id.
 * Does not create Guardian documents or Storage objects.
 */
export async function persistConnectorOntologyExtraction(
  supabase: SupabaseClient,
  input: PersistConnectorOntologyInput
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
    sourceType: "connector",
    sourceId: input.sourceItemId,
    createdBy: input.userId,
    confidence: 1,
    description: `Connected source file (${input.analysisVersion})`,
  });
  if (docEntity.created) stats.entitiesCreated += 1;
  else stats.entitiesMatched += 1;
  entityNameMap.set(normalizeEntityName(input.fileName), docEntity.entity.id);

  // Idempotent evidence for the document entity from this source item.
  await ensureEvidence(supabase, {
    profileId: input.profileId,
    entityId: docEntity.entity.id,
    sourceItemId: input.sourceItemId,
    evidenceText: `Source file "${input.fileName}" analyzed from connected storage.`,
    confidence: 1,
    stats,
  });

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
      sourceType: "connector",
      sourceId: input.sourceItemId,
      createdBy: input.userId,
      properties: extracted.attributes ?? {},
    });

    entityNameMap.set(key, result.entity.id);
    if (result.created) stats.entitiesCreated += 1;
    else stats.entitiesMatched += 1;

    await ensureEvidence(supabase, {
      profileId: input.profileId,
      entityId: result.entity.id,
      sourceItemId: input.sourceItemId,
      evidenceText:
        extracted.description ??
        `Entity "${extracted.name}" inferred from ${input.fileName}.`,
      confidence: extracted.confidence,
      stats,
    });

    await ensureRelationship(supabase, {
      profileId: input.profileId,
      sourceEntityId: result.entity.id,
      targetEntityId: docEntity.entity.id,
      relationshipType: "EVIDENCED_BY",
      confidence: extracted.confidence,
      createdBy: input.userId,
      evidenceText: `Entity "${extracted.name}" evidenced by ${input.fileName}.`,
      sourceItemId: input.sourceItemId,
      stats,
    });
  }

  for (const rel of input.extraction.relationships) {
    const sourceKey = normalizeEntityName(rel.source);
    const targetKey = normalizeEntityName(rel.target);
    let sourceId = entityNameMap.get(sourceKey);
    let targetId = entityNameMap.get(targetKey);

    if (!sourceId) {
      const resolved = await resolveOntologyEntity(supabase, {
        spaceId: input.profileId,
        entityType: guessEntityType(rel.source),
        name: rel.source,
        sourceType: "connector",
        sourceId: input.sourceItemId,
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
        entityType: guessEntityType(rel.target),
        name: rel.target,
        sourceType: "connector",
        sourceId: input.sourceItemId,
        createdBy: input.userId,
        confidence: rel.confidence,
      });
      targetId = resolved.entity.id;
      entityNameMap.set(targetKey, targetId);
      if (resolved.created) stats.entitiesCreated += 1;
      else stats.entitiesMatched += 1;
    }

    await ensureRelationship(supabase, {
      profileId: input.profileId,
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: rel.type,
      confidence: rel.confidence,
      createdBy: input.userId,
      evidenceText: rel.evidence.slice(0, 300),
      sourceItemId: input.sourceItemId,
      stats,
    });
  }

  for (const event of input.extraction.events) {
    // Also resolve as event entity for graph connectivity.
    const eventEntity = await resolveOntologyEntity(supabase, {
      spaceId: input.profileId,
      entityType: "event",
      name: event.title,
      sourceType: "connector",
      sourceId: input.sourceItemId,
      createdBy: input.userId,
      confidence: event.confidence ?? 0.7,
      description: event.type,
    });
    if (eventEntity.created) stats.entitiesCreated += 1;
    else stats.entitiesMatched += 1;

    const { error } = await supabase.from("ontology_events").insert({
      profile_id: input.profileId,
      event_type: event.type,
      title: event.title,
      event_date: event.eventDate ?? null,
      source_document_id: null,
      confidence: event.confidence ?? null,
      properties: {
        source_type: "connector",
        source_item_id: input.sourceItemId,
        analysis_version: input.analysisVersion,
      },
    });
    if (!error) stats.eventsCreated += 1;
  }

  return stats;
}

function guessEntityType(name: string): string {
  const lower = name.toLowerCase();
  if (/\b(inc|llc|corp|company|restaurant|cafe)\b/.test(lower)) {
    return "organization";
  }
  return "organization";
}

async function ensureEvidence(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    entityId?: string;
    relationshipId?: string;
    sourceItemId: string;
    evidenceText: string;
    confidence: number;
    stats: OntologyPersistStats;
  }
): Promise<void> {
  let query = supabase
    .from("ontology_evidence")
    .select("id")
    .eq("profile_id", args.profileId)
    .eq("source_type", "connector")
    .eq("source_id", args.sourceItemId)
    .limit(1);

  if (args.entityId) query = query.eq("entity_id", args.entityId);
  if (args.relationshipId) {
    query = query.eq("relationship_id", args.relationshipId);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) return;

  const { error } = await supabase.from("ontology_evidence").insert({
    profile_id: args.profileId,
    entity_id: args.entityId ?? null,
    relationship_id: args.relationshipId ?? null,
    source_type: "connector",
    source_id: args.sourceItemId,
    document_id: null,
    evidence_text: args.evidenceText.slice(0, 500),
    confidence: args.confidence,
  });
  if (!error) args.stats.evidenceCreated += 1;
}

async function ensureRelationship(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidence: number;
    createdBy: string;
    evidenceText: string;
    sourceItemId: string;
    stats: OntologyPersistStats;
  }
): Promise<void> {
  if (args.sourceEntityId === args.targetEntityId) return;

  const { data: existing } = await supabase
    .from("ontology_relationships")
    .select("id")
    .eq("profile_id", args.profileId)
    .eq("source_entity_id", args.sourceEntityId)
    .eq("target_entity_id", args.targetEntityId)
    .eq("relationship_type", args.relationshipType)
    .maybeSingle();

  let relationshipId = existing?.id as string | undefined;
  let created = false;

  if (!relationshipId) {
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
          "connector",
          args.relationshipType
        ),
        source_document_id: null,
        created_by: args.createdBy,
        properties: {
          source_type: "connector",
          source_item_id: args.sourceItemId,
        },
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create relationship");
    }
    relationshipId = data.id;
    created = true;
  }

  if (created) args.stats.relationshipsCreated += 1;

  await ensureEvidence(supabase, {
    profileId: args.profileId,
    relationshipId,
    sourceItemId: args.sourceItemId,
    evidenceText: args.evidenceText,
    confidence: args.confidence,
    stats: args.stats,
  });
}

/** Load ontology rows previously written for a source item. */
export async function listOntologyForSourceItem(
  supabase: SupabaseClient,
  profileId: string,
  sourceItemId: string
): Promise<{
  entities: Array<{
    id: string;
    entity_type: string;
    name: string;
    confidence: number | null;
    review_status: string | null;
  }>;
  relationships: Array<{
    id: string;
    relationship_type: string;
    confidence: number | null;
    review_status: string | null;
    source_name: string;
    target_name: string;
  }>;
}> {
  const { data: evidence } = await supabase
    .from("ontology_evidence")
    .select("entity_id, relationship_id")
    .eq("profile_id", profileId)
    .eq("source_type", "connector")
    .eq("source_id", sourceItemId);

  const entityIds = [
    ...new Set(
      (evidence ?? [])
        .map((e) => e.entity_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const relationshipIds = [
    ...new Set(
      (evidence ?? [])
        .map((e) => e.relationship_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const entities: Array<{
    id: string;
    entity_type: string;
    name: string;
    confidence: number | null;
    review_status: string | null;
  }> = [];

  if (entityIds.length > 0) {
    const { data } = await supabase
      .from("ontology_entities")
      .select("id, entity_type, name, confidence, review_status")
      .eq("profile_id", profileId)
      .in("id", entityIds)
      .neq("review_status", "rejected");
    for (const row of data ?? []) {
      entities.push({
        id: row.id,
        entity_type: row.entity_type,
        name: row.name,
        confidence: row.confidence,
        review_status: row.review_status,
      });
    }
  }

  const relationships: Array<{
    id: string;
    relationship_type: string;
    confidence: number | null;
    review_status: string | null;
    source_name: string;
    target_name: string;
  }> = [];

  if (relationshipIds.length > 0) {
    const { data } = await supabase
      .from("ontology_relationships")
      .select(
        "id, relationship_type, confidence, review_status, source_entity_id, target_entity_id"
      )
      .eq("profile_id", profileId)
      .in("id", relationshipIds)
      .neq("review_status", "rejected");

    const needNames = new Set<string>();
    for (const row of data ?? []) {
      needNames.add(row.source_entity_id);
      needNames.add(row.target_entity_id);
    }
    const nameMap = new Map<string, string>();
    if (needNames.size > 0) {
      const { data: named } = await supabase
        .from("ontology_entities")
        .select("id, name")
        .in("id", [...needNames]);
      for (const n of named ?? []) nameMap.set(n.id, n.name);
    }

    for (const row of data ?? []) {
      relationships.push({
        id: row.id,
        relationship_type: row.relationship_type,
        confidence: row.confidence,
        review_status: row.review_status,
        source_name: nameMap.get(row.source_entity_id) ?? "Unknown",
        target_name: nameMap.get(row.target_entity_id) ?? "Unknown",
      });
    }
  }

  return { entities, relationships };
}
