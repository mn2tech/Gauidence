import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseKnowledgeExtraction } from "../v2/schema.ts";
import { reviewStatusForConfidence, shouldPersistFact } from "../v2/confidence.ts";
import { normalizeEntityName, factDedupKey } from "../v2/normalize.ts";
import { formatKnowledgeForGideon } from "../v2/formatForGideon.ts";
import type { KnowledgeRetrievalResult } from "../v2/retrieve.ts";

describe("knowledge extraction schema", () => {
  it("validates Patrick pay rate extraction", () => {
    const parsed = parseKnowledgeExtraction({
      entities: [
        {
          name: "Patrick",
          entityType: "person",
          confidence: 0.95,
        },
        {
          name: "TTB Contract",
          entityType: "contract",
          confidence: 0.9,
        },
      ],
      facts: [
        {
          subject: "Patrick",
          predicate: "has_rate",
          value: "70",
          unit: "hour",
          confidence: 0.92,
          sourceExcerpt: "Patrick consulting rate is $70 per hour",
        },
      ],
      relationships: [
        {
          subject: "Patrick",
          relationship: "works_on",
          object: "TTB Contract",
          confidence: 0.88,
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed?.facts[0]?.predicate, "has_rate");
  });

  it("rejects facts without source excerpt", () => {
    const parsed = parseKnowledgeExtraction({
      entities: [],
      facts: [
        {
          subject: "Patrick",
          predicate: "has_rate",
          confidence: 0.9,
        },
      ],
      relationships: [],
    });
    assert.equal(parsed, null);
  });
});

describe("confidence thresholds", () => {
  it("auto-saves high confidence facts", () => {
    assert.equal(reviewStatusForConfidence(0.92), "confirmed");
    assert.equal(shouldPersistFact(0.92), true);
  });

  it("suggests medium confidence facts", () => {
    assert.equal(reviewStatusForConfidence(0.75), "suggested");
    assert.equal(shouldPersistFact(0.75), true);
  });

  it("does not persist low confidence facts", () => {
    assert.equal(reviewStatusForConfidence(0.5), null);
    assert.equal(shouldPersistFact(0.5), false);
  });
});

describe("entity normalization", () => {
  it("normalizes NM2TECH variants", () => {
    assert.equal(
      normalizeEntityName("NM2TECH LLC"),
      normalizeEntityName("nm2tech")
    );
  });

  it("deduplicates facts by subject predicate and date", () => {
    const a = factDedupKey({
      subject: "Patrick",
      predicate: "has_rate",
      objectValue: "70",
      effectiveDate: "2026-04-01",
    });
    const b = factDedupKey({
      subject: "Patrick",
      predicate: "has_rate",
      objectValue: "65",
      effectiveDate: "2025-01-01",
    });
    assert.notEqual(a, b);
  });
});

describe("formatKnowledgeForGideon", () => {
  it("includes source document citation", () => {
    const formatted = formatKnowledgeForGideon(
      {
        facts: [
          {
            id: "f1",
            subjectName: "Patrick",
            predicate: "has_rate",
            objectValue: "70",
            unit: "hour",
            effectiveDate: null,
            expirationDate: null,
            confidence: 0.92,
            reviewStatus: "confirmed",
            sourceDocumentId: "doc-1",
            sourceChunkId: null,
            sourceExcerpt: "rate is $70 per hour",
            sourceFileName: "consulting-agreement.pdf",
            profileId: "p1",
            knowledgeScore: 0.9,
          },
        ],
        entities: [],
        relationships: [],
      },
      { p1: "NM2TECH" }
    );
    assert.match(formatted, /Patrick/);
    assert.match(formatted, /consulting-agreement\.pdf/);
    assert.match(formatted, /doc:doc-1/);
  });
});

describe("vehicle registration expiration", () => {
  it("parses expiration fact", () => {
    const parsed = parseKnowledgeExtraction({
      entities: [
        { name: "Toyota Highlander", entityType: "vehicle", confidence: 0.9 },
        { name: "Maryland Registration", entityType: "policy", confidence: 0.85 },
      ],
      facts: [
        {
          subject: "Maryland Registration",
          predicate: "expires_on",
          expirationDate: "2027-04-15",
          confidence: 0.91,
          sourceExcerpt: "Registration expires 04/15/2027",
        },
      ],
      relationships: [
        {
          subject: "Toyota Highlander",
          relationship: "has_registration",
          object: "Maryland Registration",
          confidence: 0.9,
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed?.facts[0]?.expirationDate, "2027-04-15");
  });
});
