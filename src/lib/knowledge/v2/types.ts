export const KNOWLEDGE_ENTITY_TYPES = [
  "person",
  "organization",
  "project",
  "contract",
  "invoice",
  "document",
  "asset",
  "vehicle",
  "property",
  "policy",
  "account",
  "event",
  "task",
  "location",
  "product",
  "topic",
  "custom",
] as const;

export type KnowledgeEntityType = (typeof KNOWLEDGE_ENTITY_TYPES)[number];

export const KNOWLEDGE_PREDICATES = [
  "works_for",
  "works_on",
  "belongs_to",
  "owns",
  "manages",
  "assigned_to",
  "related_to",
  "billed_to",
  "paid_by",
  "has_rate",
  "has_policy",
  "has_registration",
  "expires_on",
  "located_at",
  "parent_of",
  "spouse_of",
  "member_of",
  "references",
  "created_by",
  "custom",
] as const;

export type KnowledgePredicate = (typeof KNOWLEDGE_PREDICATES)[number];

export type KnowledgeReviewStatus =
  | "confirmed"
  | "suggested"
  | "rejected"
  | "superseded";

export type ExtractedEntity = {
  name: string;
  entityType: KnowledgeEntityType;
  aliases?: string[];
  confidence: number;
  sourceExcerpt?: string;
};

export type ExtractedFact = {
  subject: string;
  subjectType?: KnowledgeEntityType;
  predicate: string;
  object?: string;
  objectType?: KnowledgeEntityType;
  value?: string;
  valueType?: string;
  unit?: string;
  effectiveDate?: string;
  expirationDate?: string;
  confidence: number;
  sourceExcerpt: string;
};

export type ExtractedRelationship = {
  subject: string;
  relationship: string;
  object: string;
  confidence: number;
  sourceExcerpt?: string;
};

export type KnowledgeExtractionResult = {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
};

export type KnowledgeFactCandidate = {
  id: string;
  subjectName: string;
  predicate: string;
  objectValue: string | null;
  unit: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  confidence: number;
  reviewStatus: KnowledgeReviewStatus;
  sourceDocumentId: string | null;
  sourceChunkId: string | null;
  sourceExcerpt: string | null;
  sourceFileName: string | null;
  profileId: string;
  knowledgeScore: number;
};
