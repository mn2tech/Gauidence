import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProposedSpaceCreate,
  stripProposedSpaceCreateSection,
  wantsSpaceCreate,
  proposedSpaceCreateSummary,
} from "../proposeCreate.ts";

describe("wantsSpaceCreate", () => {
  it("detects create space intent", () => {
    assert.equal(wantsSpaceCreate("Create a space for my side business"), true);
    assert.equal(wantsSpaceCreate("Add a new family space called Smith"), true);
    assert.equal(wantsSpaceCreate("Make a workspace for Acme LLC"), true);
  });

  it("ignores queries and client requests", () => {
    assert.equal(wantsSpaceCreate("What spaces do I have?"), false);
    assert.equal(wantsSpaceCreate("Create a client request for Aaron"), false);
  });
});

describe("parseProposedSpaceCreate", () => {
  it("parses a top-level business space", () => {
    const content = `Sure — here's the proposal.

## PROPOSED SPACE
display_name: Acme LLC
profile_type: business
option_id: business
parent_placement: top_level
`;
    const parsed = parseProposedSpaceCreate(content);
    assert.ok(parsed);
    assert.equal(parsed.displayName, "Acme LLC");
    assert.equal(parsed.profileType, "business");
    assert.equal(parsed.parentPlacement, "top_level");
    assert.equal(parsed.parentProfileId, undefined);
  });

  it("parses nested client space with parent", () => {
    const parentId = "11111111-1111-4111-8111-111111111111";
    const content = `## PROPOSED SPACE
display_name: Jane Client
profile_type: client
parent_placement: under_parent
parent_profile_id: ${parentId}
`;
    const parsed = parseProposedSpaceCreate(content);
    assert.ok(parsed);
    assert.equal(parsed.parentPlacement, "under_parent");
    assert.equal(parsed.parentProfileId, parentId);
  });
});

describe("stripProposedSpaceCreateSection", () => {
  it("removes the proposal block", () => {
    const content = `I'll set this up for you.

## PROPOSED SPACE
display_name: Test
profile_type: other
parent_placement: top_level
`;
    assert.equal(
      stripProposedSpaceCreateSection(content),
      "I'll set this up for you."
    );
  });
});

describe("proposedSpaceCreateSummary", () => {
  it("labels top-level placement", () => {
    const summary = proposedSpaceCreateSummary({
      displayName: "Acme",
      profileType: "business",
      parentPlacement: "top_level",
    });
    assert.match(summary, /Acme/);
    assert.match(summary, /top level/i);
  });
});
