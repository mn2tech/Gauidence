import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldWidenWorkspaceDocumentSearch } from "../widenWorkspaceSearch.ts";

describe("shouldWidenWorkspaceDocumentSearch", () => {
  it("widens empty This-space search when more Spaces exist", () => {
    assert.equal(
      shouldWidenWorkspaceDocumentSearch({
        searchScope: "workspace",
        hasExplicitSpaceFocus: false,
        retrievedChunkCount: 0,
        accessibleProfileCount: 3,
        workspaceSearchProfileCount: 1,
      }),
      true
    );
  });

  it("does not widen All spaces, focused, or non-empty retrieval", () => {
    assert.equal(
      shouldWidenWorkspaceDocumentSearch({
        searchScope: "global",
        hasExplicitSpaceFocus: false,
        retrievedChunkCount: 0,
        accessibleProfileCount: 3,
        workspaceSearchProfileCount: 1,
      }),
      false
    );
    assert.equal(
      shouldWidenWorkspaceDocumentSearch({
        searchScope: "workspace",
        hasExplicitSpaceFocus: true,
        retrievedChunkCount: 0,
        accessibleProfileCount: 3,
        workspaceSearchProfileCount: 1,
      }),
      false
    );
    assert.equal(
      shouldWidenWorkspaceDocumentSearch({
        searchScope: "workspace",
        hasExplicitSpaceFocus: false,
        retrievedChunkCount: 2,
        accessibleProfileCount: 3,
        workspaceSearchProfileCount: 1,
      }),
      false
    );
  });
});
