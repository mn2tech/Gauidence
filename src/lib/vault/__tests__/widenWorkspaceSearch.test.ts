import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldPersistChatScopedProfile,
  shouldWidenAfterFocusedSpaceMiss,
  shouldWidenWorkspaceDocumentSearch,
} from "../widenWorkspaceSearch.ts";

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

describe("shouldWidenAfterFocusedSpaceMiss", () => {
  it("widens when a named Space focus returned nothing", () => {
    assert.equal(
      shouldWidenAfterFocusedSpaceMiss({
        hadNamedSpaceFocus: true,
        retrievedChunkCount: 0,
        accessibleProfileCount: 4,
        focusedSearchProfileCount: 1,
      }),
      true
    );
  });

  it("does not widen when focus already hit docs", () => {
    assert.equal(
      shouldWidenAfterFocusedSpaceMiss({
        hadNamedSpaceFocus: true,
        retrievedChunkCount: 3,
        accessibleProfileCount: 4,
        focusedSearchProfileCount: 1,
      }),
      false
    );
  });
});

describe("shouldPersistChatScopedProfile", () => {
  it("requires evidence from the scoped Space", () => {
    assert.equal(
      shouldPersistChatScopedProfile({
        scopedProfileId: "tesla",
        activeProfileId: "nolan",
        retrievedChunks: [{ profile_id: "mini" }],
      }),
      false
    );
    assert.equal(
      shouldPersistChatScopedProfile({
        scopedProfileId: "tesla",
        activeProfileId: "nolan",
        retrievedChunks: [{ profile_id: "tesla" }],
      }),
      true
    );
  });
});
