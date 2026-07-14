import { GIDEON_SYSTEM } from "./gideon";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  file_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
  /** Set when searching a linked member vault from a Family/Business container. */
  profile_id?: string;
  profile_name?: string;
};

export function formatRetrievalContext(chunks: RetrievedChunk[]): {
  context: string;
  citations: { documentId: string; fileName: string; profileName?: string }[];
} {
  if (chunks.length === 0) {
    return { context: "", citations: [] };
  }

  const citationMap = new Map<
    string,
    { fileName: string; profileName?: string }
  >();
  const blocks: string[] = [];
  for (const c of chunks) {
    citationMap.set(c.document_id, {
      fileName: c.file_name,
      profileName: c.profile_name,
    });
    const vault = c.profile_name?.trim()
      ? ` | vault:${c.profile_name.trim()}`
      : "";
    const label = c.profile_name?.trim()
      ? `${c.profile_name.trim()} · ${c.file_name}`
      : c.file_name;
    blocks.push(
      `[Source: ${label}${vault} | doc:${c.document_id} | chunk:${c.chunk_index} | sim:${c.similarity.toFixed(3)}]\n${c.content}`
    );
  }

  const citations = [...citationMap.entries()].map(
    ([documentId, { fileName, profileName }]) => ({
      documentId,
      fileName,
      ...(profileName ? { profileName } : {}),
    })
  );

  return {
    context: blocks.join("\n\n---\n\n"),
    citations,
  };
}

export type VaultCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
};

/**
 * Only attach sources that the answer actually names, and that appear in
 * retrieval. Never show unrelated retrieved files as "Source".
 */
export function selectCitationsForAnswer(
  answer: string,
  chunks: RetrievedChunk[]
): VaultCitation[] {
  if (!answer.trim() || chunks.length === 0) return [];

  const byDoc = new Map<
    string,
    { fileName: string; similarity: number; profileName?: string }
  >();
  for (const c of chunks) {
    const prev = byDoc.get(c.document_id);
    if (!prev || c.similarity > prev.similarity) {
      byDoc.set(c.document_id, {
        fileName: c.file_name,
        similarity: c.similarity,
        profileName: c.profile_name,
      });
    }
  }

  const answerLower = answer.toLowerCase();
  const matched: {
    documentId: string;
    fileName: string;
    similarity: number;
    profileName?: string;
  }[] = [];

  for (const [documentId, meta] of byDoc) {
    const { fileName, similarity, profileName } = meta;
    const name = fileName.toLowerCase();
    const base = name.replace(/\.[^.]+$/, "");
    const vault = profileName?.trim().toLowerCase() ?? "";
    const labeled = vault ? `${vault} · ${name}` : name;
    if (
      answerLower.includes(name) ||
      answerLower.includes(labeled) ||
      (vault && answerLower.includes(vault) && answerLower.includes(base))
    ) {
      matched.push({ documentId, fileName, similarity, profileName });
      continue;
    }
    if (base.length >= 6 && answerLower.includes(base)) {
      matched.push({ documentId, fileName, similarity, profileName });
    }
  }

  if (matched.length === 0) return [];

  matched.sort((a, b) => b.similarity - a.similarity);
  return matched.map(({ documentId, fileName, profileName }) => ({
    documentId,
    fileName,
    ...(profileName ? { profileName } : {}),
  }));
}

/** @deprecated Use GIDEON_SYSTEM — kept as alias for vault modules. */
export const VAULT_CHAT_SYSTEM = GIDEON_SYSTEM;
