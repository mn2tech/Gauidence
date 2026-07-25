import { extractEntities } from "./entity-extractor";
import { suggestMemories } from "./memory-generator";
import { suggestRelationships } from "./relationship-builder";
import { suggestTimelineEvents } from "./timeline-generator";
import type { KnowledgeInput, KnowledgePreview } from "./types";

function logEvent(
  event: string,
  payload: Record<string, unknown>
): void {
  console.info(`[knowledge-engine] ${event}`, payload);
}

export class KnowledgeEngine {
  /** Shadow-mode processing: analyze content and return a preview only. */
  static async process(input: KnowledgeInput): Promise<KnowledgePreview> {
    logEvent("knowledge_engine_started", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      profileId: input.profileId,
      vaultId: input.vaultId ?? null,
      contentLength: input.content.length,
    });

    try {
      const entities = extractEntities(input.content);
      logEvent("knowledge_entities_extracted", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: entities.length,
      });

      const suggestedMemories = suggestMemories(input, entities);
      logEvent("knowledge_memories_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: suggestedMemories.length,
      });

      const suggestedTimelineEvents = suggestTimelineEvents(input, entities);
      logEvent("knowledge_timeline_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: suggestedTimelineEvents.length,
      });

      const suggestedRelationships = suggestRelationships(input, entities);
      logEvent("knowledge_relationships_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: suggestedRelationships.length,
      });

      const preview: KnowledgePreview = {
        entities,
        suggestedMemories,
        suggestedTimelineEvents,
        suggestedRelationships,
      };

      logEvent("knowledge_engine_completed", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        profileId: input.profileId,
        vaultId: input.vaultId ?? null,
        entityCount: entities.length,
        memoryCount: suggestedMemories.length,
        timelineCount: suggestedTimelineEvents.length,
        relationshipCount: suggestedRelationships.length,
      });

      return preview;
    } catch (err) {
      console.error("[knowledge-engine] knowledge_engine_failed", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        profileId: input.profileId,
        error: err instanceof Error ? err.message : "error",
      });
      throw err;
    }
  }
}
