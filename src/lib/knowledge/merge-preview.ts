import type {
  KnowledgeEntityPreview,
  KnowledgeMemoryPreview,
  KnowledgePreview,
  KnowledgeRelationshipPreview,
  KnowledgeTimelinePreview,
} from "./types";

function entityKey(entity: KnowledgeEntityPreview): string {
  const normalized =
    entity.normalizedName ?? entity.name.trim().toLowerCase().replace(/\s+/g, " ");
  return `${entity.type}:${normalized}`;
}

function memoryKey(memory: KnowledgeMemoryPreview): string {
  return `${memory.category}:${memory.key ?? memory.value}`;
}

function timelineKey(event: KnowledgeTimelinePreview): string {
  return `${event.title}:${event.eventDate ?? ""}`;
}

function relationshipKey(rel: KnowledgeRelationshipPreview): string {
  return `${rel.subject}|${rel.relationship}|${rel.object}`.toLowerCase();
}

function mergeByKey<T>(
  primary: T[],
  secondary: T[],
  keyFn: (item: T) => string,
  scoreFn: (item: T) => number
): T[] {
  const merged = new Map<string, T>();

  for (const item of [...primary, ...secondary]) {
    const key = keyFn(item);
    const existing = merged.get(key);
    if (!existing || scoreFn(item) > scoreFn(existing)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

export function mergeKnowledgePreviews(
  analysis: KnowledgePreview,
  heuristic: KnowledgePreview
): KnowledgePreview {
  return {
    entities: mergeByKey(
      analysis.entities,
      heuristic.entities,
      entityKey,
      (e) => e.confidence ?? 0
    ),
    suggestedMemories: mergeByKey(
      analysis.suggestedMemories,
      heuristic.suggestedMemories,
      memoryKey,
      (m) => m.importance * m.confidence
    ),
    suggestedTimelineEvents: mergeByKey(
      analysis.suggestedTimelineEvents,
      heuristic.suggestedTimelineEvents,
      timelineKey,
      (e) => e.confidence
    ),
    suggestedRelationships: mergeByKey(
      analysis.suggestedRelationships,
      heuristic.suggestedRelationships,
      relationshipKey,
      (r) => r.confidence
    ),
  };
}
