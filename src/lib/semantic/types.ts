import type {
  SemanticEntityType,
  SemanticFactPredicate,
  SemanticRelationshipType,
} from "./ontology";

export type SemanticSourceType =
  | "document"
  | "note"
  | "daily_log"
  | "upload"
  | "guardian_item"
  | "connector"
  | "email"
  | "calendar"
  | "manual";

export type SemanticObjectType = "entity" | "relationship" | "fact";

export type SemanticEntity = {
  id: string;
  user_id: string;
  canonical_name: string;
  entity_type: string;
  normalized_name: string | null;
  description: string | null;
  aliases: string[];
  attributes: Record<string, unknown>;
  confidence: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SemanticRelationship = {
  id: string;
  user_id: string;
  source_entity_id: string;
  relationship_type: string;
  target_entity_id: string;
  attributes: Record<string, unknown>;
  confidence: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SemanticFact = {
  id: string;
  user_id: string;
  subject_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_json: Record<string, unknown> | null;
  confidence: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SemanticEvidence = {
  id: string;
  user_id: string;
  source_type: string;
  source_id: string;
  space_id: string | null;
  source_title: string | null;
  source_excerpt: string | null;
  source_metadata: Record<string, unknown>;
  created_at: string;
};

export type ExtractedSemanticEntity = {
  temporaryId: string;
  type: SemanticEntityType | string;
  name: string;
  aliases?: string[];
  description?: string;
  attributes?: Record<string, unknown>;
  confidence: number;
};

export type ExtractedSemanticRelationship = {
  source: string;
  type: SemanticRelationshipType | string;
  target: string;
  confidence: number;
  evidence?: string;
  attributes?: Record<string, unknown>;
};

export type ExtractedSemanticFact = {
  subject?: string;
  predicate: SemanticFactPredicate | string;
  valueText?: string;
  valueNumber?: number;
  valueDate?: string;
  valueJson?: Record<string, unknown>;
  confidence: number;
  evidence?: string;
};

export type ExtractedSemanticAction = {
  type: string;
  description: string;
  confidence: number;
};

export type SemanticExtractionResult = {
  entities: ExtractedSemanticEntity[];
  relationships: ExtractedSemanticRelationship[];
  facts: ExtractedSemanticFact[];
  actions: ExtractedSemanticAction[];
  warnings: string[];
};

export type SemanticExtractionInput = {
  userId: string;
  spaceId?: string;
  sourceType: SemanticSourceType | string;
  sourceId: string;
  sourceTitle?: string;
  content: string;
};

export type EntityResolutionKind =
  | "exact"
  | "alias"
  | "fuzzy"
  | "semantic"
  | "created";

export type EntityResolutionResult = {
  entity: SemanticEntity;
  resolution: EntityResolutionKind;
  confidence: number;
};

export type ResolveEntityCandidate = {
  type: string;
  name: string;
  aliases?: string[];
  description?: string;
  attributes?: Record<string, unknown>;
  confidence?: number;
  sourceType?: string;
  sourceId?: string;
};

export type SemanticIngestResult = {
  entitiesCreated: number;
  entitiesResolved: number;
  relationshipsUpserted: number;
  factsUpserted: number;
  evidenceCreated: number;
  evidenceLinksCreated: number;
  resolutions: Array<{
    name: string;
    resolution: EntityResolutionKind;
    entityId: string;
  }>;
  warnings: string[];
  skipped: boolean;
};

export const SEMANTIC_ENTITY_SELECT = `
  id, user_id, canonical_name, entity_type, normalized_name, description,
  aliases, attributes, confidence, first_seen_at, last_seen_at,
  created_at, updated_at
`;

export const SEMANTIC_RELATIONSHIP_SELECT = `
  id, user_id, source_entity_id, relationship_type, target_entity_id,
  attributes, confidence, first_seen_at, last_seen_at, created_at, updated_at
`;

export const SEMANTIC_FACT_SELECT = `
  id, user_id, subject_entity_id, predicate, value_text, value_number,
  value_date, value_json, confidence, status, created_at, updated_at
`;
