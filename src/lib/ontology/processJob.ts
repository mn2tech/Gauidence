import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractOntologyWithLlm } from "./extract";
import { persistOntologyExtraction } from "./persist";
import { isOntologyDiagnosticsEnabled } from "@/lib/features/ontology";

export async function processOntologyExtraction(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  profileId: string
): Promise<void> {
  const started = Date.now();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_name, ontology_status")
    .eq("id", documentId)
    .maybeSingle();

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select("title, summary, document_type, specialist, source_text")
    .eq("document_id", documentId)
    .maybeSingle();

  if (!extracted) {
    throw new Error("No extracted_data for ontology extraction");
  }

  const sourceText =
    extracted.source_text?.trim() ||
    [extracted.title, extracted.summary].filter(Boolean).join("\n");

  if (!sourceText.trim()) {
    await supabase
      .from("documents")
      .update({ ontology_status: "skipped" })
      .eq("id", documentId);
    return;
  }

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();

  const result = await extractOntologyWithLlm({
    sourceText,
    fileName: doc?.file_name ?? "document",
    documentType: extracted.document_type,
    title: extracted.title,
    summary: extracted.summary,
    spaceName: profile?.display_name ?? null,
    specialist:
      extracted.specialist && typeof extracted.specialist === "object"
        ? (extracted.specialist as Record<string, unknown>)
        : null,
  });

  if (!result) {
    await supabase
      .from("documents")
      .update({ ontology_status: "completed" })
      .eq("id", documentId);
    return;
  }

  const stats = await persistOntologyExtraction(supabase, {
    userId,
    profileId,
    documentId,
    fileName: doc?.file_name ?? "document",
    extraction: result,
  });

  if (isOntologyDiagnosticsEnabled()) {
    console.info(
      "ontology_extraction_diagnostics",
      JSON.stringify({
        documentId,
        profileId,
        entitiesExtracted: result.entities.length,
        relationshipsExtracted: result.relationships.length,
        ...stats,
        durationMs: Date.now() - started,
      })
    );
  }
}
