import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractKnowledgeWithLlm } from "./extract";
import { persistKnowledgeExtraction } from "./persistFacts";
import { isKnowledgeDiagnosticsEnabled } from "@/lib/features/knowledge-engine-v2";

export async function processKnowledgeExtractionJob(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string
): Promise<void> {
  const started = Date.now();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_name")
    .eq("id", documentId)
    .maybeSingle();

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select(
      "title, summary, document_type, specialist, source_text, facts"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (!extracted) {
    throw new Error("No extracted_data for document");
  }

  const sourceText =
    extracted.source_text?.trim() ||
    [extracted.title, extracted.summary].filter(Boolean).join("\n");

  if (!sourceText.trim()) {
    throw new Error("No indexable text for knowledge extraction");
  }

  const result = await extractKnowledgeWithLlm({
    sourceText,
    fileName: doc?.file_name ?? "document",
    documentType: extracted.document_type,
    title: extracted.title,
    summary: extracted.summary,
    specialist:
      extracted.specialist && typeof extracted.specialist === "object"
        ? (extracted.specialist as Record<string, unknown>)
        : null,
  });

  if (!result) {
    throw new Error("LLM knowledge extraction returned invalid schema");
  }

  const saved = await persistKnowledgeExtraction(supabase, {
    userId,
    profileId,
    documentId,
    sourceType: "document",
    sourceId: documentId,
    extraction: result,
  });

  if (isKnowledgeDiagnosticsEnabled()) {
    console.info("knowledge_extraction_diagnostics", JSON.stringify({
      documentId,
      profileId,
      extractionVersion: "v2",
      entitiesExtracted: result.entities.length,
      factsExtracted: result.facts.length,
      relationshipsExtracted: result.relationships.length,
      entitiesSaved: saved.entities,
      factsSaved: saved.facts,
      relationshipsSaved: saved.relationships,
      durationMs: Date.now() - started,
    }));
  }
}
