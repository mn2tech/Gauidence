import "server-only";

import { isKnowledgeEngineEnabled } from "@/lib/features/knowledge-engine";
import { KnowledgeEngine } from "./knowledge-engine";
import type { KnowledgeInput } from "./types";

/**
 * Fire-and-forget Knowledge Engine entry point for API routes.
 * Never throws — parent document/log saves must not be affected.
 */
export async function triggerKnowledgeEngine(
  input: KnowledgeInput
): Promise<void> {
  if (!isKnowledgeEngineEnabled()) {
    console.info("[knowledge-engine] knowledge_engine_skipped", {
      reason: "disabled",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    return;
  }

  if (!input.content.trim()) {
    console.info("[knowledge-engine] knowledge_engine_skipped", {
      reason: "empty_content",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    return;
  }

  try {
    const preview = await KnowledgeEngine.process(input);
    console.info("[knowledge-engine] knowledge_engine_preview", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      profileId: input.profileId,
      vaultId: input.vaultId ?? null,
      entityCount: preview.entities.length,
      memoryCount: preview.suggestedMemories.length,
      timelineCount: preview.suggestedTimelineEvents.length,
      relationshipCount: preview.suggestedRelationships.length,
    });
  } catch (err) {
    console.error("[knowledge-engine] knowledge_engine_failed", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      profileId: input.profileId,
      error: err instanceof Error ? err.message : "error",
    });
  }
}
