import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareVaultChunks, type VaultIndexSource } from "./chunk";
import { embedTexts, isVaultEmbeddingConfigured } from "./embeddings";
import type { RetrievedChunk } from "./retrieve";

export type { RetrievedChunk };
export {
  formatRetrievalContext,
  selectCitationsForAnswer,
  selectImageCitationsFromChunks,
  markImageCitations,
  VAULT_CHAT_SYSTEM,
} from "./retrieve";
export type { VaultCitation } from "./retrieve";

export type IndexDocumentArgs = {
  supabase: SupabaseClient;
  userId: string;
  profileId: string;
  documentId: string;
  fileName: string;
  source: Omit<VaultIndexSource, "fileName">;
};

/**
 * Replace all chunks for a document with fresh embeddings from analysis.
 * No-ops (returns skipped) when OPENAI_API_KEY is unset so analyze still works.
 */
export async function indexDocumentForVault(
  args: IndexDocumentArgs
): Promise<{ indexed: number; skipped?: string }> {
  if (!isVaultEmbeddingConfigured()) {
    return { indexed: 0, skipped: "missing_openai_key" };
  }

  const chunks = prepareVaultChunks({
    fileName: args.fileName,
    ...args.source,
  });

  await args.supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", args.documentId)
    .eq("user_id", args.userId);

  if (chunks.length === 0) {
    return { indexed: 0 };
  }

  const embeddings = await embedTexts(chunks);
  const rows = chunks.map((content, chunk_index) => ({
    document_id: args.documentId,
    user_id: args.userId,
    profile_id: args.profileId,
    file_name: args.fileName,
    chunk_index,
    content,
    embedding: embeddings[chunk_index],
  }));

  const { error } = await args.supabase.from("document_chunks").insert(rows);
  if (error) {
    throw new Error(`Failed to index document chunks: ${error.message}`);
  }

  return { indexed: rows.length };
}

export async function retrieveVaultChunks(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  profileId: string,
  matchCount = 8
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_profile_id: profileId,
  });
  if (error) {
    throw new Error(`Vault retrieval failed: ${error.message}`);
  }
  return (data ?? []) as RetrievedChunk[];
}
