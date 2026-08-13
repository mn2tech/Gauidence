import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { enqueueDocumentProcessingJob } from "@/lib/documents/processingJobs";
import {
  planOntologyDetach,
  type DetachEntity,
  type DetachEvidence,
  type DetachRelationship,
} from "./detachFromDocument";

export type RelocateOntologyResult = {
  detached: boolean;
  reextractQueued: boolean;
  warning?: string;
};

function isThisDocumentEvidence(
  documentId: string,
  row: { document_id: string | null; source_type: string | null; source_id: string | null }
): boolean {
  if (row.document_id === documentId) return true;
  return row.source_type === "document" && row.source_id === documentId;
}

export async function detachOntologyForDocument(
  supabase: SupabaseClient,
  args: { spaceId: string; documentId: string }
): Promise<{ detached: boolean; error?: string }> {
  const { data: byDocumentId, error: byDocError } = await supabase
    .from("ontology_evidence")
    .select("id, entity_id, relationship_id, document_id, source_type, source_id")
    .eq("profile_id", args.spaceId)
    .eq("document_id", args.documentId);
  if (byDocError) return { detached: false, error: byDocError.message };

  const { data: bySourceId, error: bySourceError } = await supabase
    .from("ontology_evidence")
    .select("id, entity_id, relationship_id, document_id, source_type, source_id")
    .eq("profile_id", args.spaceId)
    .eq("source_type", "document")
    .eq("source_id", args.documentId);
  if (bySourceError) return { detached: false, error: bySourceError.message };

  const documentEvidenceById = new Map<string, DetachEvidence>();
  for (const row of [...(byDocumentId ?? []), ...(bySourceId ?? [])]) {
    documentEvidenceById.set(row.id, row as DetachEvidence);
  }
  const documentEvidence = [...documentEvidenceById.values()];

  const { data: events, error: eventError } = await supabase
    .from("ontology_events")
    .select("id")
    .eq("profile_id", args.spaceId)
    .eq("source_document_id", args.documentId);
  if (eventError) {
    return { detached: false, error: eventError.message };
  }

  const touchedEntityIds = new Set<string>();
  const touchedRelIds = new Set<string>();
  for (const row of documentEvidence) {
    if (row.entity_id) touchedEntityIds.add(row.entity_id);
    if (row.relationship_id) touchedRelIds.add(row.relationship_id);
  }

  const [{ data: sourcedEntities, error: sourcedError }, { data: sourcedRels, error: sourcedRelError }] =
    await Promise.all([
      supabase
        .from("ontology_entities")
        .select("id, entity_type, source_type, source_id")
        .eq("profile_id", args.spaceId)
        .eq("source_type", "document")
        .eq("source_id", args.documentId),
      supabase
        .from("ontology_relationships")
        .select("id, source_document_id, source_entity_id, target_entity_id")
        .eq("profile_id", args.spaceId)
        .eq("source_document_id", args.documentId),
    ]);

  if (sourcedError) return { detached: false, error: sourcedError.message };
  if (sourcedRelError) return { detached: false, error: sourcedRelError.message };

  for (const entity of sourcedEntities ?? []) touchedEntityIds.add(entity.id);
  for (const rel of sourcedRels ?? []) touchedRelIds.add(rel.id);

  let entities: DetachEntity[] = (sourcedEntities ?? []) as DetachEntity[];
  if (touchedEntityIds.size > 0) {
    const { data: extraEntities, error } = await supabase
      .from("ontology_entities")
      .select("id, entity_type, source_type, source_id")
      .eq("profile_id", args.spaceId)
      .in("id", [...touchedEntityIds]);
    if (error) return { detached: false, error: error.message };
    const byId = new Map(entities.map((row) => [row.id, row]));
    for (const row of extraEntities ?? []) byId.set(row.id, row as DetachEntity);
    entities = [...byId.values()];
  }

  let relationships: DetachRelationship[] = (sourcedRels ?? []) as DetachRelationship[];
  if (touchedRelIds.size > 0) {
    const { data: extraRels, error } = await supabase
      .from("ontology_relationships")
      .select("id, source_document_id, source_entity_id, target_entity_id")
      .eq("profile_id", args.spaceId)
      .in("id", [...touchedRelIds]);
    if (error) return { detached: false, error: error.message };
    const byId = new Map(relationships.map((row) => [row.id, row]));
    for (const row of extraRels ?? []) byId.set(row.id, row as DetachRelationship);
    relationships = [...byId.values()];
  }

  const otherEvidence: DetachEvidence[] = [];
  if (touchedEntityIds.size > 0) {
    const { data, error } = await supabase
      .from("ontology_evidence")
      .select("id, entity_id, relationship_id, document_id, source_type, source_id")
      .eq("profile_id", args.spaceId)
      .in("entity_id", [...touchedEntityIds]);
    if (error) return { detached: false, error: error.message };
    for (const row of data ?? []) {
      if (isThisDocumentEvidence(args.documentId, row)) continue;
      otherEvidence.push(row as DetachEvidence);
    }
  }
  if (touchedRelIds.size > 0) {
    const { data, error } = await supabase
      .from("ontology_evidence")
      .select("id, entity_id, relationship_id, document_id, source_type, source_id")
      .eq("profile_id", args.spaceId)
      .in("relationship_id", [...touchedRelIds]);
    if (error) return { detached: false, error: error.message };
    const seen = new Set(otherEvidence.map((row) => row.id));
    for (const row of data ?? []) {
      if (isThisDocumentEvidence(args.documentId, row) || seen.has(row.id)) continue;
      otherEvidence.push(row as DetachEvidence);
    }
  }

  const plan = planOntologyDetach({
    documentId: args.documentId,
    documentEvidence,
    otherEvidence,
    relationships,
    entities,
  });

  if (plan.deleteEvidenceIds.length) {
    const { error } = await supabase
      .from("ontology_evidence")
      .delete()
      .eq("profile_id", args.spaceId)
      .in("id", plan.deleteEvidenceIds);
    if (error) return { detached: false, error: error.message };
  }

  if (plan.clearRelationshipSourceDocIds.length) {
    const { error } = await supabase
      .from("ontology_relationships")
      .update({ source_document_id: null })
      .eq("profile_id", args.spaceId)
      .in("id", plan.clearRelationshipSourceDocIds);
    if (error) return { detached: false, error: error.message };
  }

  if (plan.deleteRelationshipIds.length) {
    const { error } = await supabase
      .from("ontology_relationships")
      .delete()
      .eq("profile_id", args.spaceId)
      .in("id", plan.deleteRelationshipIds);
    if (error) return { detached: false, error: error.message };
  }

  if (plan.deleteEntityIds.length) {
    const { error } = await supabase
      .from("ontology_entities")
      .delete()
      .eq("profile_id", args.spaceId)
      .in("id", plan.deleteEntityIds);
    if (error) return { detached: false, error: error.message };
  }

  const eventIds = (events ?? []).map((row) => row.id);
  if (eventIds.length) {
    const { error } = await supabase
      .from("ontology_events")
      .delete()
      .eq("profile_id", args.spaceId)
      .in("id", eventIds);
    if (error) return { detached: false, error: error.message };
  }

  return { detached: true };
}

/**
 * After a document moves spaces: detach its graph from the old space,
 * then queue extraction into the new space.
 */
export async function relocateOntologyAfterDocumentMove(
  supabase: SupabaseClient,
  args: {
    userId: string;
    documentId: string;
    fromSpaceId: string;
    toSpaceId: string;
  }
): Promise<RelocateOntologyResult> {
  const detached = await detachOntologyForDocument(supabase, {
    spaceId: args.fromSpaceId,
    documentId: args.documentId,
  });

  await supabase
    .from("documents")
    .update({ ontology_status: "pending" })
    .eq("id", args.documentId);

  if (!isGuardianOntologyEnabled()) {
    return {
      detached: detached.detached,
      reextractQueued: false,
      warning: detached.error
        ? "Document moved, but ontology in the old space may still mention it."
        : undefined,
    };
  }

  const queued = await enqueueDocumentProcessingJob(supabase, {
    documentId: args.documentId,
    profileId: args.toSpaceId,
    userId: args.userId,
    jobType: "extract_ontology",
    force: true,
  });

  const warning = detached.error
    ? "Document moved, but ontology in the old space may still mention it."
    : !queued.enqueued
      ? "Document moved. Ask Gideon in the new space after analysis finishes if the map looks empty."
      : undefined;

  return {
    detached: detached.detached,
    reextractQueued: queued.enqueued,
    warning,
  };
}
