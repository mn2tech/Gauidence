import type {
  KnowledgeInput,
  KnowledgePreview,
} from "./types";

export function normalizeKnowledgeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function relationshipKey(
  subject: string,
  relationship: string,
  object: string
): string {
  return [
    normalizeKnowledgeKey(subject),
    normalizeKnowledgeKey(relationship),
    normalizeKnowledgeKey(object),
  ].join("|");
}

export function timelineKey(
  title: string,
  eventDate?: string | null,
  sourceId?: string
): string {
  return [
    normalizeKnowledgeKey(title),
    eventDate ?? "",
    sourceId ?? "",
  ].join("|");
}

export function suggestionKey(kind: string, parts: string[]): string {
  return [kind, ...parts.map(normalizeKnowledgeKey)].join("|");
}

export type PersistKnowledgeResult = {
  entities: number;
  relationships: number;
  timelineEvents: number;
  suggestions: number;
};

export function summarizePersistInput(
  input: KnowledgeInput,
  preview: KnowledgePreview
): Record<string, unknown> {
  return {
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    profileId: input.profileId,
    entityCount: preview.entities.length,
    relationshipCount: preview.suggestedRelationships.length,
    timelineCount: preview.suggestedTimelineEvents.length,
    memoryCount: preview.suggestedMemories.length,
  };
}
