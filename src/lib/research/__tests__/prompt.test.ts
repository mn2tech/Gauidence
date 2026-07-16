import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSubjectKind,
  parseResearchBrief,
  sanitizeResearchQuery,
} from "../prompt.ts";

describe("research helpers", () => {
  it("sanitizes research queries", () => {
    assert.equal(sanitizeResearchQuery("  Acme Co  "), "Acme Co");
    assert.equal(sanitizeResearchQuery("a"), null);
    assert.equal(sanitizeResearchQuery(null), null);
  });

  it("normalizes subject kinds", () => {
    assert.equal(normalizeSubjectKind("company"), "company");
    assert.equal(normalizeSubjectKind("person"), "person");
    assert.equal(normalizeSubjectKind("nope"), "other");
  });

  it("parses research brief sections", () => {
    const sections = parseResearchBrief(`## OVERVIEW
A software vendor.

## FROM THE WEB
They won a USCIS task [1].

## GIDEON'S SUGGESTION
Save this brief to your vault.`);
    assert.equal(sections.length, 3);
    assert.equal(sections[0]?.kind, "overview");
    assert.equal(sections[1]?.kind, "from_the_web");
    assert.match(sections[1]?.body ?? "", /USCIS/);
    assert.equal(sections[2]?.kind, "suggestion");
  });
});
