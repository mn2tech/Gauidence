import type { GuardableChunk } from "./retrievalGuard";
import type { RetrievedArtifactGroup } from "./types";

const DEFAULT_MAX_CHUNK_CHARS = 700;

/**
 * Format retrieval context grouped by artifact so unrelated docs are not
 * merged into one apparent source.
 */
export function formatGroupedArtifactContext(
  groups: RetrievedArtifactGroup[],
  options?: { maxChunkChars?: number; onlyIncluded?: boolean }
): {
  context: string;
  citations: { documentId: string; fileName: string; profileName?: string }[];
} {
  const maxChunkChars = options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const onlyIncluded = options?.onlyIncluded ?? true;
  const selected = onlyIncluded ? groups.filter((g) => g.included) : groups;

  if (selected.length === 0) {
    return { context: "", citations: [] };
  }

  const citationMap = new Map<
    string,
    { fileName: string; profileName?: string }
  >();
  const blocks: string[] = [];

  for (const group of selected) {
    const name = group.artifact.sourceName ?? group.artifact.artifactId;
    citationMap.set(group.artifact.artifactId, {
      fileName: name,
      profileName: undefined,
    });
    const header = [
      `ARTIFACT ${group.artifact.artifactId}`,
      `source_type=${group.artifact.sourceType}`,
      `source_name=${name}`,
      `space_id=${group.artifact.spaceId ?? "?"}`,
      `relevance=${group.maxRelevance.toFixed(3)}`,
      `sensitivity=${group.artifact.sensitivity}`,
      `reason=${group.reasonRetrieved}`,
    ].join(" | ");

    const chunkBlocks = group.chunks.map((c) => {
      citationMap.set(c.artifactId, {
        fileName: c.sourceName,
      });
      return `[chunk:${c.chunkId} | score:${c.relevanceScore.toFixed(3)}]\n${trimChunk(c.content, maxChunkChars)}`;
    });

    blocks.push(`${header}\n${chunkBlocks.join("\n\n")}`);
  }

  return {
    context: blocks.join("\n\n========\n\n"),
    citations: [...citationMap.entries()].map(([documentId, meta]) => ({
      documentId,
      fileName: meta.fileName,
      ...(meta.profileName ? { profileName: meta.profileName } : {}),
    })),
  };
}

/** Fallback: group flat chunks when guard groups are unavailable. */
export function formatChunksGroupedByDocument(
  chunks: GuardableChunk[],
  options?: { maxChunkChars?: number }
): string {
  const maxChunkChars = options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const byDoc = new Map<string, GuardableChunk[]>();
  for (const c of chunks) {
    const list = byDoc.get(c.document_id) ?? [];
    list.push(c);
    byDoc.set(c.document_id, list);
  }
  const blocks: string[] = [];
  for (const [docId, list] of byDoc) {
    const fileName = list[0]?.file_name ?? docId;
    const space = list[0]?.profile_name?.trim();
    const header = `ARTIFACT ${docId} | source_name=${fileName}${space ? ` | space=${space}` : ""}`;
    const body = list
      .map(
        (c) =>
          `[chunk:${c.id} | idx:${c.chunk_index}]\n${trimChunk(c.content, maxChunkChars)}`
      )
      .join("\n\n");
    blocks.push(`${header}\n${body}`);
  }
  return blocks.join("\n\n========\n\n");
}

function trimChunk(content: string, maxChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}
