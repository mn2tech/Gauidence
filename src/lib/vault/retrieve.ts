import { GIDEON_SYSTEM } from "./gideon";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  file_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export function formatRetrievalContext(chunks: RetrievedChunk[]): {
  context: string;
  citations: { documentId: string; fileName: string }[];
} {
  if (chunks.length === 0) {
    return { context: "", citations: [] };
  }

  const citationMap = new Map<string, string>();
  const blocks: string[] = [];
  for (const c of chunks) {
    citationMap.set(c.document_id, c.file_name);
    blocks.push(
      `[Source: ${c.file_name} | doc:${c.document_id} | chunk:${c.chunk_index} | sim:${c.similarity.toFixed(3)}]\n${c.content}`
    );
  }

  const citations = [...citationMap.entries()].map(([documentId, fileName]) => ({
    documentId,
    fileName,
  }));

  return {
    context: blocks.join("\n\n---\n\n"),
    citations,
  };
}

/** @deprecated Use GIDEON_SYSTEM — kept as alias for vault modules. */
export const VAULT_CHAT_SYSTEM = GIDEON_SYSTEM;
