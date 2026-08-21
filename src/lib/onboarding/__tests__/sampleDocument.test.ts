import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSampleDocumentFile,
  firstWinHeadline,
  pickFirstWinHighlights,
  sampleBodyForProfileKind,
} from "../sampleDocument.ts";
import type { Fact } from "../../analysis/types.ts";

describe("sample document onboarding", () => {
  it("builds a text sample file", () => {
    const file = buildSampleDocumentFile("personal");
    assert.equal(file.type, "text/plain");
    assert.match(file.name, /camp|flyer|sample/i);
    assert.ok(file.size > 50);
  });

  it("picks a receipt sample for business vaults", () => {
    const sample = sampleBodyForProfileKind("business");
    assert.match(sample.content, /receipt|invoice|oil change/i);
  });

  it("prefers dated facts for the wow card", () => {
    const facts: Fact[] = [
      {
        label: "Fee",
        value: "$150",
        source: "document",
        date: null,
      },
      {
        label: "Registration deadline",
        value: "June 15, 2026",
        source: "document",
        date: "2026-06-15",
      },
      {
        label: "Camp start",
        value: "July 6, 2026",
        source: "document",
        date: "2026-07-06",
      },
    ];
    const picks = pickFirstWinHighlights(facts, 3);
    assert.equal(picks.length, 2);
    assert.ok(picks.every((p) => p.date));
    assert.match(firstWinHeadline(picks), /2 important dates/i);
  });

  it("falls back to any facts when no dates", () => {
    const facts: Fact[] = [
      {
        label: "Location",
        value: "Riverside Park",
        source: "document",
        date: null,
      },
    ];
    const picks = pickFirstWinHighlights(facts);
    assert.equal(picks.length, 1);
    assert.match(firstWinHeadline(picks), /useful information/i);
  });
});
