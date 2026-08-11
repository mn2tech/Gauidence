import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.id, "a");
    assert.equal(merged[1]?.id, "b");
  });

  it("returns retrieval unchanged when nothing is pinned", () => {
    const retrieved = [chunk("b", "doc-2", "other")];
    assert.deepEqual(mergePinnedChunks([], retrieved), retrieved);
  });
});
