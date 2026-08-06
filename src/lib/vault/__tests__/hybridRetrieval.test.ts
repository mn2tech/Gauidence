import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fuseRankedResults,
  HYBRID_FINAL_TOP_K,
  RRF_K,
} from "../hybridRetrieval.ts";
import type { RetrievedChunk } from "../retrieve.ts";
import type { KeywordChunk } from "../hybridRetrieval.ts";

function vectorChunk(
  overrides: Partial<RetrievedChunk> & Pick<RetrievedChunk, "id" | "document_id">
): RetrievedChunk {
  return {
    file_name: "invoice.pdf",
    content: "Payment due",
    chunk_index: 0,
    similarity: 0.8,
    profile_id: "p1",
    ...overrides,
  };
}

function keywordChunk(
  overrides: Partial<KeywordChunk> & Pick<KeywordChunk, "id" | "document_id">
): KeywordChunk {
  return {
    profile_id: "p1",
    file_name: "invoice.pdf",
    content: "Invoice INV-12345",
    chunk_index: 0,
    keyword_score: 0.9,
    match_source: "chunk_content",
    ...overrides,
  };
}

describe("fuseRankedResults", () => {
  const profileNames = { p1: "NM2TECH" };

  it("merges duplicate vector and keyword hits into one result", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        vectorChunk({ id: "c1", document_id: "d1", content: "Invoice INV-12345" }),
      ],
      keywordResults: [
        keywordChunk({ id: "c1", document_id: "d1", content: "Invoice INV-12345" }),
      ],
      query: "INV-12345",
      profileNames,
    });
    assert.equal(fused.length, 1);
    assert.equal(fused[0]?.vector_rank, 1);
    assert.equal(fused[0]?.keyword_rank, 1);
    assert.ok((fused[0]?.fusion_score ?? 0) > 1 / (RRF_K + 1));
  });

  it("favors exact identifier matches via boost", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        vectorChunk({
          id: "c-semantic",
          document_id: "d-semantic",
          file_name: "notes.pdf",
          content: "general billing discussion",
          similarity: 0.95,
        }),
      ],
      keywordResults: [
        keywordChunk({
          id: "c-exact",
          document_id: "d-exact",
          file_name: "INV-98765.pdf",
          content: "Invoice number INV-98765",
          keyword_score: 0.7,
        }),
      ],
      query: "INV-98765",
      profileNames,
    });
    assert.equal(fused[0]?.document_id, "d-exact");
  });

  it("limits results to final top K", () => {
    const vectorResults = Array.from({ length: 15 }, (_, i) =>
      vectorChunk({
        id: `c${i}`,
        document_id: `d${i}`,
        similarity: 0.9 - i * 0.01,
      })
    );
    const fused = fuseRankedResults({
      vectorResults,
      keywordResults: [],
      query: "test",
      profileNames,
      finalTopK: HYBRID_FINAL_TOP_K,
    });
    assert.equal(fused.length, HYBRID_FINAL_TOP_K);
  });

  it("preserves profile name on fused results", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        vectorChunk({
          id: "c1",
          document_id: "d1",
          profile_id: "p1",
        }),
      ],
      keywordResults: [],
      query: "payroll",
      profileNames,
    });
    assert.equal(fused[0]?.profile_name, "NM2TECH");
  });
});

describe("semantic paraphrase vs exact search ranking", () => {
  const profileNames = { p1: "Vault" };

  it("vector rank contributes when keyword misses paraphrase", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        vectorChunk({
          id: "c1",
          document_id: "d1",
          content: "employee compensation statement for Jane Doe",
          similarity: 0.88,
        }),
      ],
      keywordResults: [],
      query: "how much does Jane earn",
      profileNames,
    });
    assert.equal(fused.length, 1);
    assert.equal(fused[0]?.vector_rank, 1);
    assert.equal(fused[0]?.keyword_rank, null);
  });
});

describe("vault scope isolation in fusion", () => {
  it("keeps chunks from distinct profiles separate", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        vectorChunk({
          id: "c1",
          document_id: "d1",
          profile_id: "vault-a",
          file_name: "a.pdf",
        }),
        vectorChunk({
          id: "c2",
          document_id: "d2",
          profile_id: "vault-b",
          file_name: "b.pdf",
        }),
      ],
      keywordResults: [],
      query: "documents",
      profileNames: { "vault-a": "Vault A", "vault-b": "Vault B" },
    });
    const profiles = new Set(fused.map((r) => r.profile_id));
    assert.equal(profiles.size, 2);
  });
});
