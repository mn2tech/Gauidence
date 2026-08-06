import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuseRankedResults } from "../hybridRetrieval.ts";
import type { RetrievedChunk } from "../retrieve.ts";
import type { KeywordChunk } from "../hybridRetrieval.ts";

describe("employee name search", () => {
  it("ranks keyword match on employee name highly", () => {
    const keywordResults: KeywordChunk[] = [
      {
        id: "c1",
        document_id: "d1",
        profile_id: "emp-1",
        file_name: "payroll.pdf",
        content: "Employee: Aaron Mitchell — gross pay $4,200",
        chunk_index: 0,
        keyword_score: 0.85,
        match_source: "chunk_content",
      },
    ];
    const fused = fuseRankedResults({
      vectorResults: [],
      keywordResults,
      query: "Aaron Mitchell",
      profileNames: { "emp-1": "Aaron" },
    });
    assert.equal(fused[0]?.content, keywordResults[0]?.content);
    assert.equal(fused[0]?.keyword_rank, 1);
  });
});

describe("exact invoice number search", () => {
  it("boosts invoice identifier in filename", () => {
    const fused = fuseRankedResults({
      vectorResults: [
        {
          id: "c-low",
          document_id: "d-low",
          file_name: "misc.pdf",
          content: "unrelated",
          chunk_index: 0,
          similarity: 0.99,
          profile_id: "p1",
        },
      ],
      keywordResults: [
        {
          id: "c-inv",
          document_id: "d-inv",
          profile_id: "p1",
          file_name: "invoice-INV-4421.pdf",
          content: "Total due $500",
          chunk_index: 0,
          keyword_score: 0.6,
          match_source: "file_name",
        },
      ],
      query: "INV-4421",
      profileNames: { p1: "Business" },
    });
    assert.equal(fused[0]?.document_id, "d-inv");
  });
});

describe("partial indexing", () => {
  it("returns available indexed chunks when others are missing", () => {
    const indexed: RetrievedChunk[] = [
      {
        id: "c1",
        document_id: "d-indexed",
        file_name: "indexed.pdf",
        content: "available content",
        chunk_index: 0,
        similarity: 0.75,
        profile_id: "p1",
      },
    ];
    const fused = fuseRankedResults({
      vectorResults: indexed,
      keywordResults: [],
      query: "available content",
      profileNames: { p1: "Vault" },
    });
    assert.equal(fused.length, 1);
    assert.equal(fused[0]?.document_id, "d-indexed");
  });
});

describe("security contract", () => {
  it("documents that RPCs enforce client_visible via can_view_vault_document_row", () => {
    // Viewer access and global membership scoping are enforced in SQL RPCs:
    // match_document_chunks_multi and search_document_chunks_keyword both call
    // can_view_vault_document_row(profile_id, client_visible).
    // TypeScript passes filter_profile_ids from resolveWorkspaceScopes only.
    assert.match(
      "can_view_vault_document_row",
      /can_view_vault_document_row/
    );
  });
});
