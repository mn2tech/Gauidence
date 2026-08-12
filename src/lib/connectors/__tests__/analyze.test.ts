import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  guessMimeFromName,
  isAnalyzeSupportedMime,
} from "../content/types";
import {
  normalizeRelationshipType,
  ONTOLOGY_ENTITY_TYPES,
  reviewStatusForConfidence,
} from "@/lib/ontology/types";

describe("connector analyze support", () => {
  it("accepts pdf, text, csv, images", () => {
    assert.equal(isAnalyzeSupportedMime("application/pdf", "a.pdf"), true);
    assert.equal(isAnalyzeSupportedMime("text/plain", "a.txt"), true);
    assert.equal(isAnalyzeSupportedMime("text/csv", "a.csv"), true);
    assert.equal(isAnalyzeSupportedMime("image/jpeg", "a.jpg"), true);
    assert.equal(isAnalyzeSupportedMime("application/zip", "a.zip"), false);
  });

  it("guesses mime from filename", () => {
    assert.equal(guessMimeFromName("receipt.PDF"), "application/pdf");
    assert.equal(guessMimeFromName("notes.txt"), "text/plain");
  });
});

describe("connector ontology vocabulary", () => {
  it("includes personal entity types", () => {
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("event"));
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("restaurant"));
    assert.ok(ONTOLOGY_ENTITY_TYPES.includes("place"));
  });

  it("normalizes personal relationship types", () => {
    assert.equal(normalizeRelationshipType("OCCURRED_AT"), "OCCURRED_AT");
    assert.equal(normalizeRelationshipType("dinner_at"), "OCCURRED_AT");
    assert.equal(normalizeRelationshipType("PURCHASED_FROM"), "PURCHASED_FROM");
    assert.equal(normalizeRelationshipType("WATCHED"), "WATCHED");
  });

  it("maps confidence to review status for connector sources", () => {
    assert.equal(reviewStatusForConfidence(0.95, "connector"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.8, "connector"), "pending");
    assert.equal(
      reviewStatusForConfidence(0.99, "connector", "RELATED_TO"),
      "pending"
    );
  });
});
