import { describe, expect, it } from "vitest";
import { mergePinnedChunks } from "../retrieve";
import type { RetrievedChunk } from "../retrieve";

function chunk(
  id: string,
  documentId: string,
  content: string
): RetrievedChunk {
  return {
    id,
    document_id: documentId,
    file_name: "photo.png",
    content,
    chunk_index: 0,
    similarity: 0.5,
  };
}

describe("mergePinnedChunks", () => {
  it("prepends pinned chunks and removes duplicates from retrieval", () => {
    const pinned = [chunk("a", "doc-1", "pinned text")];
    const retrieved = [
      chunk("a", "doc-1", "pinned text"),
      chunk("b", "doc-2", "other"),
    ];
    const merged = mergePinnedChunks(pinned, retrieved);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe("a");
    expect(merged[1]?.id).toBe("b");
  });

  it("returns retrieval unchanged when nothing is pinned", () => {
    const retrieved = [chunk("b", "doc-2", "other")];
    expect(mergePinnedChunks([], retrieved)).toEqual(retrieved);
  });
});
