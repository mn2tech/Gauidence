import { enrichFromDocumentAnalysis } from "./enrich-from-analysis";
import { extractEntities } from "./entity-extractor";
import { mergeKnowledgePreviews } from "./merge-preview";
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

function buildHeuristicPreview(
  input: KnowledgeInput
): KnowledgePreview {
  const entities = extractEntities(input.content);
  return {
    entities,
    suggestedMemories: suggestMemories(input, entities),
    suggestedTimelineEvents: suggestTimelineEvents(input, entities),
    suggestedRelationships: suggestRelationships(input, entities),
  };
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
      hasAnalysisContext: Boolean(input.analysisContext),
    });

    try {
      const heuristic = buildHeuristicPreview(input);
      if (input.analysisContext) {
        heuristic.suggestedMemories = heuristic.suggestedMemories.filter(
          (memory) =>
            !(memory.category === "summary" && memory.key === "opening_context")
        );
      }
      logEvent("knowledge_entities_extracted", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: heuristic.entities.length,
        source: "heuristic",
      });

      let preview = heuristic;

      if (input.analysisContext) {
        const fromAnalysis = enrichFromDocumentAnalysis(
          input,
          input.analysisContext
        );
        preview = mergeKnowledgePreviews(fromAnalysis, heuristic);
        logEvent("knowledge_analysis_enriched", {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          analysisEntityCount: fromAnalysis.entities.length,
          analysisMemoryCount: fromAnalysis.suggestedMemories.length,
          analysisTimelineCount: fromAnalysis.suggestedTimelineEvents.length,
          analysisRelationshipCount: fromAnalysis.suggestedRelationships.length,
          mergedEntityCount: preview.entities.length,
          mergedMemoryCount: preview.suggestedMemories.length,
          mergedTimelineCount: preview.suggestedTimelineEvents.length,
          mergedRelationshipCount: preview.suggestedRelationships.length,
        });
      }

      logEvent("knowledge_memories_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: preview.suggestedMemories.length,
      });

      logEvent("knowledge_timeline_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: preview.suggestedTimelineEvents.length,
      });

      logEvent("knowledge_relationships_suggested", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        count: preview.suggestedRelationships.length,
      });

      logEvent("knowledge_engine_completed", {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        profileId: input.profileId,
        vaultId: input.vaultId ?? null,
        entityCount: preview.entities.length,
        memoryCount: preview.suggestedMemories.length,
        timelineCount: preview.suggestedTimelineEvents.length,
        relationshipCount: preview.suggestedRelationships.length,
        enrichedFromAnalysis: Boolean(input.analysisContext),
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
