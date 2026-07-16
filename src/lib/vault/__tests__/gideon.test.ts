import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGideonSuggestions,
  firstNameFrom,
  parseGideonSections,
  GIDEON_SYSTEM,
  GIDEON_BRAND_LINE,
} from "../gideon.ts";

describe("Gideon helpers", () => {
  it("exposes brand line and system identity", () => {
    assert.match(GIDEON_SYSTEM, /You are Gideon/);
    assert.match(GIDEON_SYSTEM, /Payment status is unknown/);
    assert.match(GIDEON_SYSTEM, /GENERAL KNOWLEDGE/);
    assert.match(GIDEON_SYSTEM, /general knowledge rather than the user's vault/i);
    assert.equal(
      GIDEON_BRAND_LINE,
      "Guardian watches. Gideon explains. You decide."
    );
  });

  it("parses first name from full name", () => {
    assert.equal(firstNameFrom("Ada Lovelace"), "Ada");
    assert.equal(firstNameFrom("  "), null);
    assert.equal(firstNameFrom(null), null);
  });

  it("only suggests invoice questions when invoices exist", () => {
    const plain = buildGideonSuggestions([
      { documentType: "other", fileName: "notes.pdf" },
    ]);
    assert.ok(!plain.some((q) => /invoice|receive/i.test(q)));

    const withInvoice = buildGideonSuggestions([
      { documentType: "invoice", guardianStatus: "upcoming", fileName: "inv.pdf" },
    ]);
    assert.ok(withInvoice.some((q) => /receive|invoice/i.test(q)));
    assert.ok(withInvoice.some((q) => /attention/i.test(q)));
    assert.ok(withInvoice.length <= 5);
  });

  it("returns no suggestions for an empty vault", () => {
    assert.deepEqual(buildGideonSuggestions([]), []);
  });

  it("parses Gideon response sections", () => {
    const sections = parseGideonSections(`## FROM YOUR DOCUMENTS
Due date is August 5, 2026.

## FROM YOUR DAILY LOG
You recorded a follow-up on July 13.

## FROM YOUR PROFILES
2 employees are linked to this business in Guardian.

## CALCULATED
3 days remaining.

## GENERAL KNOWLEDGE
This is general knowledge, not from your Guardian vault: a W-2 reports wages.

## GIDEON'S SUGGESTION
Confirm the amount before paying.

## NEEDS VERIFICATION
Payment status is unclear.`);

    assert.equal(sections.length, 7);
    assert.equal(sections[0]?.kind, "from_documents");
    assert.equal(sections[1]?.kind, "from_daily_log");
    assert.equal(sections[2]?.kind, "from_profiles");
    assert.equal(sections[3]?.kind, "calculated");
    assert.equal(sections[4]?.kind, "general_knowledge");
    assert.equal(sections[5]?.kind, "suggestion");
    assert.equal(sections[6]?.kind, "needs_verification");
    assert.match(sections[0]!.content, /August 5/);
    assert.match(sections[2]!.content, /2 employees/);
    assert.match(sections[4]!.content, /W-2/);
  });

  it("treats plain answers as a single body section", () => {
    const sections = parseGideonSections(
      "I couldn't find that information in your current vault."
    );
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.kind, "body");
  });
});
