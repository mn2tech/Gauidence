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

export type VaultCitation = { documentId: string; fileName: string };

/**
 * Only attach sources that the answer actually names, and that appear in
 * retrieval. Never show unrelated retrieved files as "Source".
 */
export function selectCitationsForAnswer(
  answer: string,
  chunks: RetrievedChunk[]
): VaultCitation[] {
  if (!answer.trim() || chunks.length === 0) return [];

  const byDoc = new Map<string, { fileName: string; similarity: number }>();
  for (const c of chunks) {
    const prev = byDoc.get(c.document_id);
    if (!prev || c.similarity > prev.similarity) {
      byDoc.set(c.document_id, {
        fileName: c.file_name,
        similarity: c.similarity,
      });
    }
  }

  const answerLower = answer.toLowerCase();
  const matched: { documentId: string; fileName: string; similarity: number }[] =
    [];

  for (const [documentId, { fileName, similarity }] of byDoc) {
    const name = fileName.toLowerCase();
    const base = name.replace(/\.[^.]+$/, "");
    if (answerLower.includes(name)) {
      matched.push({ documentId, fileName, similarity });
      continue;
    }
    // Basename match (avoid tiny tokens)
    if (base.length >= 6 && answerLower.includes(base)) {
      matched.push({ documentId, fileName, similarity });
    }
  }

  if (matched.length === 0) return [];

  matched.sort((a, b) => b.similarity - a.similarity);
  return matched.map(({ documentId, fileName }) => ({ documentId, fileName }));
}

/** @deprecated Use GIDEON_SYSTEM — kept as alias for vault modules. */
export const VAULT_CHAT_SYSTEM = GIDEON_SYSTEM;
