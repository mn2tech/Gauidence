import type { DocumentAnalysisContext } from "./document-analysis-context";

export type KnowledgeSourceType = "document" | "daily_log" | "conversation";

export type { DocumentAnalysisContext };

export interface KnowledgeInput {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  profileId: string;
  vaultId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  /** Structured fields from document analysis — avoids re-processing or duplicating source text. */
  analysisContext?: DocumentAnalysisContext;
}

export interface KnowledgeEntityPreview {
  type: string;
  name: string;
  normalizedName?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeMemoryPreview {
  category: string;
  key?: string;
  value: string;
  confidence: number;
  importance: number;
  sourceType: KnowledgeSourceType;
  sourceId: string;
}

export interface KnowledgeTimelinePreview {
  title: string;
  eventDate?: string;
  category?: string;
  confidence: number;
  sourceType: KnowledgeSourceType;
  sourceId: string;
}

export interface KnowledgeRelationshipPreview {
  subject: string;
  relationship: string;
  object: string;
  confidence: number;
  sourceType: KnowledgeSourceType;
  sourceId: string;
}

export interface KnowledgePreview {
  entities: KnowledgeEntityPreview[];
  suggestedMemories: KnowledgeMemoryPreview[];
  suggestedTimelineEvents: KnowledgeTimelinePreview[];
  suggestedRelationships: KnowledgeRelationshipPreview[];
}
