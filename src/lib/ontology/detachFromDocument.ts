/**
 * Decide what to remove from a space's ontology when a document leaves that space.
 * Shared entities with leftover evidence/relationships stay put.
 */

export type DetachEvidence = {
  id: string;
  entity_id: string | null;
  relationship_id: string | null;
};

export type DetachRelationship = {
  id: string;
  source_document_id: string | null;
  source_entity_id: string;
  target_entity_id: string;
};

export type DetachEntity = {
  id: string;
  entity_type: string;
  source_type: string | null;
  source_id: string | null;
};

export type OntologyDetachPlan = {
  deleteEvidenceIds: string[];
  deleteRelationshipIds: string[];
  deleteEntityIds: string[];
  clearRelationshipSourceDocIds: string[];
};

export function planOntologyDetach(args: {
  documentId: string;
  documentEvidence: DetachEvidence[];
  otherEvidence: DetachEvidence[];
  relationships: DetachRelationship[];
  entities: DetachEntity[];
}): OntologyDetachPlan {
  const deleteEvidenceIds = args.documentEvidence.map((row) => row.id);

  const otherByRel = new Map<string, number>();
  const otherByEntity = new Map<string, number>();
  for (const row of args.otherEvidence) {
    if (row.relationship_id) {
      otherByRel.set(
        row.relationship_id,
        (otherByRel.get(row.relationship_id) ?? 0) + 1
      );
    }
    if (row.entity_id) {
      otherByEntity.set(row.entity_id, (otherByEntity.get(row.entity_id) ?? 0) + 1);
    }
  }

  const touchedRelIds = new Set<string>();
  for (const row of args.documentEvidence) {
    if (row.relationship_id) touchedRelIds.add(row.relationship_id);
  }
  for (const rel of args.relationships) {
    if (rel.source_document_id === args.documentId) touchedRelIds.add(rel.id);
  }

  const relById = new Map(args.relationships.map((rel) => [rel.id, rel]));
  const deleteRelationshipIds: string[] = [];
  const clearRelationshipSourceDocIds: string[] = [];

  for (const id of touchedRelIds) {
    if ((otherByRel.get(id) ?? 0) === 0) {
      deleteRelationshipIds.push(id);
      continue;
    }
    if (relById.get(id)?.source_document_id === args.documentId) {
      clearRelationshipSourceDocIds.push(id);
    }
  }

  const deletedRels = new Set(deleteRelationshipIds);
  const stillLinked = new Set<string>();
  for (const rel of args.relationships) {
    if (deletedRels.has(rel.id)) continue;
    stillLinked.add(rel.source_entity_id);
    stillLinked.add(rel.target_entity_id);
  }

  const touchedEntityIds = new Set<string>();
  for (const row of args.documentEvidence) {
    if (row.entity_id) touchedEntityIds.add(row.entity_id);
  }
  for (const entity of args.entities) {
    if (entity.source_type === "document" && entity.source_id === args.documentId) {
      touchedEntityIds.add(entity.id);
    }
  }

  const deleteEntityIds: string[] = [];
  for (const id of touchedEntityIds) {
    const entity = args.entities.find((row) => row.id === id);
    if (!entity) continue;

    const isMovedDocumentEntity =
      entity.entity_type === "document" && entity.source_id === args.documentId;
    if (isMovedDocumentEntity) {
      deleteEntityIds.push(id);
      continue;
    }
    if (entity.source_type === "manual") continue;

    const hasOtherEvidence = (otherByEntity.get(id) ?? 0) > 0;
    if (!hasOtherEvidence && !stillLinked.has(id)) {
      deleteEntityIds.push(id);
    }
  }

  return {
    deleteEvidenceIds,
    deleteRelationshipIds,
    deleteEntityIds,
    clearRelationshipSourceDocIds,
  };
}
