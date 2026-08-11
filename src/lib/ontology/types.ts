/** Review status for ontology entities and relationships. */
export type OntologyReviewStatus = "pending" | "confirmed" | "rejected";

/** Supported ontology entity types for Phase 1. */
export const ONTOLOGY_ENTITY_TYPES = [
  "person",
  "organization",
  "project",
  "asset",
  "contract",
  "invoice",
  "document",
] as const;

export type OntologyEntityType = (typeof ONTOLOGY_ENTITY_TYPES)[number];

export type OntologySourceType =
  | "manual"
  | "document"
  | "daily_log"
  | "memory"
  | "proposal"
  | "api"
  | "connector";

export type OntologyEntity = {
  id: string;
  profile_id: string;
  entity_type: string;
  name: string;
  canonical_name: string | null;
  description: string | null;
  properties: Record<string, unknown>;
  confidence: number | null;
  review_status?: OntologyReviewStatus;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OntologyEntityAlias = {
  id: string;
  profile_id: string;
  entity_id: string;
  alias: string;
  normalized_alias: string;
  created_at: string;
};

export type OntologyRelationship = {
  id: string;
  profile_id: string;
  source_entity_id: string;
  relationship_type: string;
  target_entity_id: string;
  properties: Record<string, unknown>;
  confidence: number | null;
  review_status?: OntologyReviewStatus;
  source_document_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OntologyEvidence = {
  id: string;
  profile_id: string;
  entity_id: string | null;
  relationship_id: string | null;
  source_type: string;
  source_id: string;
  document_id: string | null;
  chunk_id: string | null;
  evidence_text: string | null;
  page_number: number | null;
  confidence: number | null;
  created_at: string;
};

export type EntityResolutionMatchType =
  | "canonical"
  | "alias"
  | "fuzzy"
  | "created";

export type EntityResolutionResult = {
  entity: OntologyEntity;
  created: boolean;
  matchType: EntityResolutionMatchType;
};

export type ExtractedOntologyEntity = {
  type: string;
  name: string;
  aliases?: string[];
  description?: string;
  confidence: number;
};

export type ExtractedOntologyRelationship = {
  source: string;
  type: string;
  target: string;
  confidence: number;
  evidence: string;
};

export type ExtractedOntologyEvent = {
  type: string;
  title: string;
  eventDate?: string;
  confidence?: number;
};

export type OntologyExtractionResult = {
  entities: ExtractedOntologyEntity[];
  relationships: ExtractedOntologyRelationship[];
  events: ExtractedOntologyEvent[];
};

export type EntityGraph = {
  entity: OntologyEntity;
  aliases: OntologyEntityAlias[];
  outgoingRelationships: (OntologyRelationship & {
    targetEntity: OntologyEntity;
  })[];
  incomingRelationships: (OntologyRelationship & {
    sourceEntity: OntologyEntity;
  })[];
  connectedEntities: OntologyEntity[];
  evidence: (OntologyEvidence & { documentName?: string | null })[];
  paths?: OntologyPath[];
};

export type OntologyPathHop = {
  relationshipId: string;
  relationshipType: string;
  fromEntityId: string;
  toEntityId: string;
  confidence: number | null;
};

export type OntologyPath = {
  hops: number;
  nodeIds: string[];
  nodeNames: string[];
  edges: OntologyPathHop[];
  label: string;
};

export type OntologyContext = {
  matchedEntities: OntologyEntity[];
  relationships: OntologyRelationship[];
  evidence: OntologyEvidence[];
  /** Display names for entity ids referenced in relationships. */
  entityNames: Record<string, string>;
  paths: OntologyPath[];
};

export type OntologyPersistStats = {
  entitiesCreated: number;
  entitiesMatched: number;
  relationshipsCreated: number;
  evidenceCreated: number;
  eventsCreated: number;
};

export const ONTOLOGY_ENTITY_SELECT =
  "id, profile_id, entity_type, name, canonical_name, description, properties, confidence, review_status, source_type, source_id, created_by, created_at, updated_at";

export const ONTOLOGY_RELATIONSHIP_SELECT =
  "id, profile_id, source_entity_id, relationship_type, target_entity_id, properties, confidence, review_status, source_document_id, created_by, created_at, updated_at";

export const ONTOLOGY_EVIDENCE_SELECT =
  "id, profile_id, entity_id, relationship_id, source_type, source_id, document_id, chunk_id, evidence_text, page_number, confidence, created_at";

/** Statuses visible to Gideon and default graph views (excludes rejected). */
export const ONTOLOGY_VISIBLE_REVIEW_STATUSES: OntologyReviewStatus[] = [
  "confirmed",
  "pending",
];

export function reviewStatusForConfidence(
  confidence: number | null | undefined,
  sourceType?: string | null
): OntologyReviewStatus {
  if (sourceType === "manual") return "confirmed";
  if (confidence != null && confidence >= 0.9) return "confirmed";
  return "pending";
}
