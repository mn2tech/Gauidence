import { GIDEON_SYSTEM } from "./gideon";

/** Cap each retrieved excerpt so vault context stays lean. */
export const CHUNK_CONTENT_MAX_CHARS = 700;
/** Keep full roster/list chunks so names are not cut off mid-list. */
export const TRANSCRIPTION_CHUNK_MAX_CHARS = 4000;

function trimChunkContent(content: string, maxChars = CHUNK_CONTENT_MAX_CHARS): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

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
  /** Hybrid retrieval diagnostics (optional). */
  vector_rank?: number | null;
  keyword_rank?: number | null;
  fusion_score?: number;
  match_source?: string;
};

export function formatRetrievalContext(
  chunks: RetrievedChunk[],
  options?: { maxChunkChars?: number }
): {
  context: string;
  citations: { documentId: string; fileName: string; profileName?: string }[];
} {
  if (chunks.length === 0) {
    return { context: "", citations: [] };
  }

  const maxChunkChars = options?.maxChunkChars ?? CHUNK_CONTENT_MAX_CHARS;
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
    const spaceTag = c.profile_name?.trim()
      ? ` | space:${c.profile_name.trim()}`
      : "";
    const label = c.profile_name?.trim()
      ? `${c.profile_name.trim()} · ${c.file_name}`
      : c.file_name;
    const rankMeta =
      c.vector_rank != null || c.keyword_rank != null
        ? ` | vRank:${c.vector_rank ?? "-"} | kRank:${c.keyword_rank ?? "-"} | fusion:${(c.fusion_score ?? c.similarity).toFixed(3)}`
        : ` | sim:${c.similarity.toFixed(3)}`;
    const sourceMeta = c.match_source ? ` | match:${c.match_source}` : "";
    blocks.push(
      `[Source: ${label}${spaceTag} | doc:${c.document_id} | chunk:${c.chunk_index}${rankMeta}${sourceMeta}]\n${trimChunkContent(c.content, maxChunkChars)}`
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

/** Prepend pinned chunks and drop duplicates from semantic retrieval. */
export function mergePinnedChunks(
  pinned: RetrievedChunk[],
  retrieved: RetrievedChunk[]
): RetrievedChunk[] {
  if (pinned.length === 0) return retrieved;
  const pinnedIds = new Set(pinned.map((c) => c.id));
  const rest = retrieved.filter((c) => !pinnedIds.has(c.id));
  return [...pinned, ...rest];
}

export type VaultCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  /** True when the source file is an image (UI may show inline preview). */
  isImage?: boolean;
  kind?: "vault" | "connector";
  sourceId?: string;
  itemId?: string;
  sourceType?: string;
  mimeType?: string | null;
  cardName?: string | null;
};

/** True when the answer (or question) clearly names this citation's file/card. */
export function citationNamedInText(
  citation: {
    fileName: string;
    profileName?: string | null;
    cardName?: string | null;
  },
  text: string
): boolean {
  const hay = text.toLowerCase();
  if (!hay.trim()) return false;

  const labels = [citation.cardName, citation.fileName]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  for (const label of labels) {
    const name = label.toLowerCase();
    const base = name.replace(/\.[^.]+$/, "").trim();
    if (name.length >= 4 && hay.includes(name)) return true;
    // Require a long stem so short accidental substrings don't match.
    if (base.length >= 10 && hay.includes(base)) return true;
    if (base.length >= 6 && base.length < 10) {
      const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(hay)) {
        return true;
      }
    }
    // Distinctive multi-token stems (e.g. lagos-dental-centre-practice-profile)
    const tokens = base
      .split(/[\s_+.\-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 5);
    if (tokens.length >= 2) {
      const hitCount = tokens.filter((t) => hay.includes(t)).length;
      if (hitCount >= 2) return true;
    }
  }

  const vault = citation.profileName?.trim().toLowerCase() ?? "";
  if (vault.length >= 4 && hay.includes(vault)) {
    for (const label of labels) {
      const base = label
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .trim();
      // Vault name alone is not enough — still need a strong file stem.
      if (base.length >= 12 && hay.includes(base)) return true;
      const tokens = base
        .split(/[\s_+.\-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 5);
      if (
        tokens.length >= 2 &&
        tokens.filter((t) => hay.includes(t)).length >= 2
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Only attach sources that the answer actually names, and that appear in
 * retrieval. Never show unrelated retrieved files as "Source".
 */
export function selectCitationsForAnswer(
  answer: string,
  chunks: RetrievedChunk[],
  question?: string
): VaultCitation[] {
  if (!answer.trim() || chunks.length === 0) return [];

  const byDoc = new Map<
    string,
    {
      fileName: string;
      similarity: number;
      profileName?: string;
    }
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
  const questionLower = (question ?? "").toLowerCase();
  const matched: {
    documentId: string;
    fileName: string;
    similarity: number;
    profileName?: string;
    score: number;
  }[] = [];

  for (const [documentId, meta] of byDoc) {
    const { fileName, similarity, profileName } = meta;
    if (!citationNamedInText({ fileName, profileName }, answer)) continue;

    let score = similarity + 2;
    if (
      questionLower &&
      citationNamedInText({ fileName, profileName }, questionLower)
    ) {
      score += 3;
    } else if (questionLower) {
      const base = fileName.toLowerCase().replace(/\.[^.]+$/, "");
      const qTokens = questionLower
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 5);
      const overlap = qTokens.filter((t) => base.includes(t)).length;
      score += Math.min(overlap, 3);
    }
    if (
      /source\s*:/i.test(answerLower) &&
      answerLower.includes(fileName.toLowerCase())
    ) {
      score += 2;
    }
    matched.push({
      documentId,
      fileName,
      similarity,
      profileName,
      score,
    });
  }

  if (matched.length === 0) return [];

  matched.sort((a, b) => b.score - a.score || b.similarity - a.similarity);

  // If the answer clearly names one primary file, drop weaker extras.
  const top = matched[0]!;
  const tight = matched.filter(
    (m) =>
      m.documentId === top.documentId ||
      answerLower.includes(m.fileName.toLowerCase()) ||
      m.score >= top.score - 0.35
  );

  return tight.slice(0, 2).map(({ documentId, fileName, profileName }) => ({
    documentId,
    fileName,
    ...(profileName ? { profileName } : {}),
  }));
}

/** Top image documents from retrieval, for "show pictures" requests. */
export function selectImageCitationsFromChunks(
  chunks: RetrievedChunk[],
  limit = 4
): VaultCitation[] {
  const byDoc = new Map<
    string,
    { fileName: string; similarity: number; profileName?: string }
  >();
  for (const c of chunks) {
    if (!/\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(c.file_name)) continue;
    const prev = byDoc.get(c.document_id);
    if (!prev || c.similarity > prev.similarity) {
      byDoc.set(c.document_id, {
        fileName: c.file_name,
        similarity: c.similarity,
        profileName: c.profile_name,
      });
    }
  }
  return [...byDoc.entries()]
    .sort((a, b) => b[1].similarity - a[1].similarity)
    .slice(0, limit)
    .map(([documentId, meta]) => ({
      documentId,
      fileName: meta.fileName,
      isImage: true,
      ...(meta.profileName ? { profileName: meta.profileName } : {}),
    }));
}

export function markImageCitations(
  citations: VaultCitation[]
): VaultCitation[] {
  return citations.map((c) => ({
    ...c,
    isImage:
      c.isImage ??
      /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(c.fileName),
  }));
}

/** One citation per document and file name (avoids duplicate previews). */
export function dedupeVaultCitations(
  citations: VaultCitation[]
): VaultCitation[] {
  const byDocumentId = new Map<string, VaultCitation>();
  for (const citation of citations) {
    if (!citation.documentId) continue;
    byDocumentId.set(citation.documentId, citation);
  }
  const byFileName = new Map<string, VaultCitation>();
  for (const citation of byDocumentId.values()) {
    const key = citation.fileName.trim().toLowerCase();
    if (!byFileName.has(key)) byFileName.set(key, citation);
  }
  return [...byFileName.values()];
}

/** @deprecated Use GIDEON_SYSTEM — kept as alias for vault modules. */
export const VAULT_CHAT_SYSTEM = GIDEON_SYSTEM;
