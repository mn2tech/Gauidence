import type {
  KnowledgeEntityPreview,
  KnowledgeInput,
  KnowledgeMemoryPreview,
} from "./types";

function firstSentence(content: string): string {
  const match = content.trim().match(/^[^.!?\n]{10,200}[.!?]?/);
  return match?.[0]?.trim() ?? content.trim().slice(0, 160);
}

/** Suggest derived memories from extracted entities (shadow mode — no persistence). */
export function suggestMemories(
  input: KnowledgeInput,
  entities: KnowledgeEntityPreview[]
): KnowledgeMemoryPreview[] {
  const memories: KnowledgeMemoryPreview[] = [];

  const summary = firstSentence(input.content);
  if (summary) {
    memories.push({
      category: "summary",
      key: "opening_context",
      value: summary,
      confidence: 0.7,
      importance: 0.6,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  for (const entity of entities.slice(0, 8)) {
    memories.push({
      category: entity.type,
      key: entity.normalizedName ?? entity.name,
      value: entity.name,
      confidence: entity.confidence ?? 0.5,
      importance: entity.type === "person" || entity.type === "organization" ? 0.8 : 0.5,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  return memories.slice(0, 20);
}
