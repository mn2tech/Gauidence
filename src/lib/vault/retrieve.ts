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

export const VAULT_CHAT_SYSTEM = `You are Guardian's vault assistant.
You answer questions using ONLY the retrieved excerpts from this user's private documents.
Rules:
1) Cite the source file name when you use information (e.g. "According to Invoice16.pdf…").
2) If the excerpts are not enough, say you do not know from the vault — do not invent.
3) Prefer document facts over calculated or AI suggestions when both appear.
4) Keep answers concise and plain language.
5) Never claim access to other users' documents.`;
