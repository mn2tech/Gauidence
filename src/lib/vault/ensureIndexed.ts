import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { indexDocumentForVault } from "./indexDocument";
import { isVaultEmbeddingConfigured } from "./embeddings";

type ExtractedRow = {
  document_id: string;
  summary: string | null;
  facts: unknown;
  title: string | null;
  document_type: string | null;
  warnings: unknown;
  specialist: unknown;
  source_text: string | null;
  source_text_indexed_at: string | null;
};

/**
 * Index analyzed documents for one profile that have no chunks yet,
 * or have stored source_text that has not been embedded yet.
 */
export async function ensureUserVaultIndexed(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{ indexedDocs: number; skipped?: string }> {
  if (!isVaultEmbeddingConfigured()) {
    return { indexedDocs: 0, skipped: "missing_openai_key" };
  }

  const { data: extracted, error } = await supabase
    .from("extracted_data")
    .select(
      "document_id, summary, facts, title, document_type, warnings, specialist, source_text, source_text_indexed_at"
    )
    .eq("profile_id", profileId);

  if (error || !extracted?.length) {
    return { indexedDocs: 0 };
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, file_name")
    .eq("profile_id", profileId)
    .in(
      "id",
      extracted.map((e) => e.document_id)
    );

  const nameById = new Map((docs ?? []).map((d) => [d.id, d.file_name]));

  const { data: existing } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("profile_id", profileId);

  const already = new Set((existing ?? []).map((r) => r.document_id));

  let indexedDocs = 0;
  for (const row of extracted as ExtractedRow[]) {
    const hasSourceText = Boolean(row.source_text?.trim());
    const sourceNotIndexed =
      hasSourceText && row.source_text_indexed_at == null;
    const needsIndex = !already.has(row.document_id) || sourceNotIndexed;
    if (!needsIndex) continue;

    const fileName = nameById.get(row.document_id);
    if (!fileName) continue;

    try {
      const result = await indexDocumentForVault({
        supabase,
        userId,
        profileId,
        documentId: row.document_id,
        fileName,
        source: {
          title: row.title,
          summary: row.summary,
          documentType: row.document_type,
          facts: Array.isArray(row.facts)
            ? (row.facts as { label?: string; value?: string; source?: string }[])
            : null,
          warnings: Array.isArray(row.warnings)
            ? (row.warnings as string[])
            : null,
          specialist:
            row.specialist && typeof row.specialist === "object"
              ? (row.specialist as Record<string, unknown>)
              : null,
          sourceText: row.source_text,
        },
      });
      if (result.indexed > 0) indexedDocs += 1;
    } catch (err) {
      console.error(
        "Vault backfill index failed:",
        err instanceof Error ? err.message : "error"
      );
    }
  }

  return { indexedDocs };
}
