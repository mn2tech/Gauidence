import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "./retrieve";

/**
 * For roster / list asks, hybrid search often returns only the first
 * matching chunks. Load the rest of those same documents so every name
 * is available in context.
 */
export async function expandTranscriptionDocumentChunks(
  supabase: SupabaseClient,
  chunks: RetrievedChunk[],
  args?: { maxDocuments?: number; maxChunks?: number }
): Promise<RetrievedChunk[]> {
  if (!chunks.length) return chunks;

  const maxDocuments = args?.maxDocuments ?? 3;
  const maxChunks = args?.maxChunks ?? 80;

  const rankedDocs: { documentId: string; bestSim: number }[] = [];
  const seenDoc = new Set<string>();
  for (const c of chunks) {
    if (!c.document_id || seenDoc.has(c.document_id)) continue;
    seenDoc.add(c.document_id);
    rankedDocs.push({ documentId: c.document_id, bestSim: c.similarity ?? 0 });
  }
  rankedDocs.sort((a, b) => b.bestSim - a.bestSim);
  const docIds = rankedDocs.slice(0, maxDocuments).map((d) => d.documentId);
  if (!docIds.length) return chunks;

  const profileByDoc = new Map<string, { profile_id?: string; profile_name?: string }>();
  for (const c of chunks) {
    if (!profileByDoc.has(c.document_id)) {
      profileByDoc.set(c.document_id, {
        profile_id: c.profile_id,
        profile_name: c.profile_name,
      });
    }
  }

  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, file_name, content, chunk_index, profile_id")
    .in("document_id", docIds)
    .order("chunk_index", { ascending: true })
    .limit(maxChunks);

  if (error || !data?.length) return chunks;

  const existing = new Set(chunks.map((c) => c.id));
  const expanded: RetrievedChunk[] = [...chunks];
  for (const row of data) {
    const id = String(row.id);
    if (existing.has(id)) continue;
    existing.add(id);
    const meta = profileByDoc.get(String(row.document_id));
    expanded.push({
      id,
      document_id: String(row.document_id),
      file_name: String(row.file_name ?? "document"),
      content: String(row.content ?? ""),
      chunk_index: Number(row.chunk_index ?? 0),
      similarity: 0.01,
      profile_id: meta?.profile_id ?? (row.profile_id ? String(row.profile_id) : undefined),
      profile_name: meta?.profile_name,
      match_source: "transcription_doc_expand",
    });
  }

  // Prefer document order for list completeness, then original rank within a chunk.
  return expanded.sort((a, b) => {
    const docCmp = a.document_id.localeCompare(b.document_id);
    if (docCmp !== 0) return docCmp;
    return a.chunk_index - b.chunk_index;
  });
}
