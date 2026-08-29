import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isGuardianSemanticLayerEnabled } from "@/lib/features/semantic-layer";
import { ingestSemanticKnowledge } from "./ingest-semantic-knowledge";
import { evaluateSemanticWatchRules } from "./watch-rules";
import { logSemanticEvent } from "./log";

/**
 * Run Semantic Layer extraction for a document after content analysis.
 * Failures are isolated — never block document ingestion success.
 */
export async function processSemanticExtraction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  spaceId: string
): Promise<{
  skipped: boolean;
  entities: number;
  relationships: number;
  facts: number;
}> {
  if (!isGuardianSemanticLayerEnabled()) {
    return { skipped: true, entities: 0, relationships: 0, facts: 0 };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, profile_id")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) {
    return { skipped: true, entities: 0, relationships: 0, facts: 0 };
  }

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select("title, summary, source_text")
    .eq("document_id", documentId)
    .maybeSingle();

  const sourceText =
    extracted?.source_text?.trim() ||
    [extracted?.title, extracted?.summary].filter(Boolean).join("\n");

  if (!sourceText.trim()) {
    logSemanticEvent("semantic_extraction_completed", {
      user_id: userId,
      source_id: documentId,
      skipped: true,
      reason: "no_source_text",
    });
    return { skipped: true, entities: 0, relationships: 0, facts: 0 };
  }

  try {
    const result = await ingestSemanticKnowledge(supabase, {
      userId,
      spaceId,
      sourceType: "document",
      sourceId: documentId,
      sourceTitle: extracted?.title ?? doc.file_name ?? undefined,
      content: sourceText,
    });

    // Watch Engine semantic rules (non-blocking)
    try {
      await evaluateSemanticWatchRules(supabase, userId, { spaceId });
    } catch (err) {
      console.error(
        "Semantic watch rules failed (non-blocking):",
        documentId,
        err instanceof Error ? err.message : err
      );
    }

    return {
      skipped: result.skipped,
      entities: result.entitiesCreated + result.entitiesResolved,
      relationships: result.relationshipsUpserted,
      facts: result.factsUpserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "semantic_failed";
    logSemanticEvent("semantic_extraction_failed", {
      user_id: userId,
      source_id: documentId,
      reason: message.slice(0, 200),
    });
    throw err;
  }
}
