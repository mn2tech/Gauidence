/** Review status for ontology entities and relationships. */
export type OntologyReviewStatus = "pending" | "confirmed" | "rejected";

/** Supported ontology entity types (business + personal connector). */
export const ONTOLOGY_ENTITY_TYPES = [
  "person",
  "organization",
  "project",
  "asset",
  "contract",
  "invoice",
  "document",
  "place",
  "event",
  "purchase",
  "restaurant",
  "movie",
  "product",
  "date",
] as const;

export type OntologyEntityType = (typeof ONTOLOGY_ENTITY_TYPES)[number];

/** Canonical relationship types for extraction (prefer specific over RELATED_TO). */
export const ONTOLOGY_RELATIONSHIP_TYPES = [
  "WORKS_FOR",
  "REPORTS_TO",
  "MANAGES",
  "FOUNDER_OF",
  "OWNS",
  "HAS_PROJECT",
  "HAS_CONTRACT",
  "HAS_INVOICE",
  "BELONGS_TO",
  "SERVICES",
  "CLIENT_OF",
  "VENDOR_OF",
  "PARTNER_OF",
  "ISSUED_BY",
  "ISSUED_TO",
  "SUBCONTRACTOR_TO",
  "PRIME_CONTRACTOR_FOR",
  "MENTIONED_IN",
  "RELATED_TO",
  "ATTENDED",
  "PART_OF",
  "OCCURRED_AT",
  "PURCHASED_FROM",
  "WATCHED",
  "VISITED",
  "OWNED_BY",
  "CREATED_BY",
  "EVIDENCED_BY",
] as const;

export type OntologyRelationshipType =
  (typeof ONTOLOGY_RELATIONSHIP_TYPES)[number];

/** Common LLM variants → canonical type. */
export const ONTOLOGY_RELATIONSHIP_ALIASES: Record<string, OntologyRelationshipType> = {
  EMPLOYED_BY: "WORKS_FOR",
  EMPLOYEE_OF: "WORKS_FOR",
  WORKS_AT: "WORKS_FOR",
  WORKED_FOR: "WORKS_FOR",
  WORKED_AT: "WORKS_FOR",
  FOUNDER: "FOUNDER_OF",
  CO_FOUNDER_OF: "FOUNDER_OF",
  OWNER_OF: "OWNS",
  OWNED_BY: "OWNED_BY",
  CONTRACTOR_TO: "SUBCONTRACTOR_TO",
  SUBCONTRACTOR_OF: "SUBCONTRACTOR_TO",
  SUBCONTRACTS_TO: "SUBCONTRACTOR_TO",
  PROVIDES_SERVICES_TO: "SERVICES",
  SERVICE_PROVIDER_FOR: "SERVICES",
  CUSTOMER_OF: "CLIENT_OF",
  SUPPLIER_OF: "VENDOR_OF",
  PARTNER_WITH: "PARTNER_OF",
  PARTNERS_WITH: "PARTNER_OF",
  RELATED: "RELATED_TO",
  ASSOCIATED_WITH: "RELATED_TO",
  MENTIONED_IN_DOCUMENT: "MENTIONED_IN",
  DINNER_AT: "OCCURRED_AT",
  HAPPENED_AT: "OCCURRED_AT",
  LOCATED_AT: "OCCURRED_AT",
  BOUGHT_FROM: "PURCHASED_FROM",
  PURCHASED_AT: "PURCHASED_FROM",
  SAW: "WATCHED",
  WENT_TO: "VISITED",
  ATTENDED_BY: "ATTENDED",
  EVIDENCE_OF: "EVIDENCED_BY",
};

export function normalizeRelationshipType(
  raw: string
): OntologyRelationshipType | null {
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!upper) return null;
  if (
    (ONTOLOGY_RELATIONSHIP_TYPES as readonly string[]).includes(upper)
  ) {
    return upper as OntologyRelationshipType;
  }
  return ONTOLOGY_RELATIONSHIP_ALIASES[upper] ?? null;
}

/** Vague RELATED_TO edges need stronger evidence and always stay in review. */
export const RELATED_TO_MIN_CONFIDENCE = 0.85;
export const RELATED_TO_MIN_EVIDENCE_CHARS = 40;
export const DEFAULT_RELATIONSHIP_MIN_CONFIDENCE = 0.55;

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
  /** Structured attributes (amount, currency, invoice_number, etc.). */
  attributes?: Record<string, unknown>;
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
  sourceType?: string | null,
  relationshipType?: string | null
): OntologyReviewStatus {
  if (sourceType === "manual") return "confirmed";
  // Vague edges always need human confirmation.
  if (relationshipType === "RELATED_TO") return "pending";
  if (confidence != null && confidence >= 0.9) return "confirmed";
  return "pending";
}
