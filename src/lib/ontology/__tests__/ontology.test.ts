import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAmbiguousPersonName,
  isFuzzyMatchAllowed,
  nameSimilarity,
  normalizeEntityName,
} from "../normalize";
import { parseOntologyExtraction } from "../schema";
import { formatOntologyForGideon, buildOntologyAnswerFallback } from "../formatForGideon";
import { reviewStatusForConfidence } from "../types";

describe("normalizeEntityName", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEntityName("  NM2TECH  "), "nm2tech");
  });

  it("normalizes LLC punctuation variants", () => {
    assert.equal(normalizeEntityName("NM2TECH, LLC."), "nm2tech llc");
    assert.equal(normalizeEntityName("Acme Inc."), "acme inc");
  });

  it("collapses repeated spaces", () => {
    assert.equal(normalizeEntityName("NM2   Tech"), "nm2 tech");
  });
});

describe("nameSimilarity", () => {
  it("returns 1 for identical normalized names", () => {
    assert.equal(nameSimilarity("NM2TECH LLC", "nm2tech, llc."), 1);
  });

  it("returns high similarity for close organization names", () => {
    const score = nameSimilarity("NM2TECH LLC", "NM2 Tech LLC");
    assert.ok(score > 0.85);
  });
});

describe("fuzzy match guards", () => {
  it("allows fuzzy match for organizations", () => {
    assert.equal(isFuzzyMatchAllowed("organization"), true);
    assert.equal(isFuzzyMatchAllowed("person"), false);
  });

  it("flags ambiguous person names", () => {
    assert.equal(isAmbiguousPersonName("John Smith"), true);
    assert.equal(isAmbiguousPersonName("Eleanor Rigby"), false);
  });
});

describe("parseOntologyExtraction", () => {
  it("parses valid extraction JSON", () => {
    const result = parseOntologyExtraction({
      entities: [
        {
          type: "organization",
          name: "NM2TECH LLC",
          aliases: ["NM2TECH", "Next Move"],
          confidence: 0.98,
        },
      ],
      relationships: [
        {
          source: "NM2TECH LLC",
          type: "SUBCONTRACTOR_TO",
          target: "Onyx Government Services",
          confidence: 0.94,
          evidence:
            "NM2TECH provides subcontracting services through Onyx Government Services.",
        },
      ],
      events: [],
    });

    assert.ok(result);
    assert.equal(result!.entities.length, 1);
    assert.equal(result!.relationships.length, 1);
    assert.equal(result!.entities[0]!.name, "NM2TECH LLC");
  });

  it("rejects relationships without evidence", () => {
    const result = parseOntologyExtraction({
      entities: [
        { type: "organization", name: "Acme", confidence: 0.9 },
      ],
      relationships: [
        {
          source: "Acme",
          type: "RELATED_TO",
          target: "Other",
          confidence: 0.9,
          evidence: "",
        },
      ],
      events: [],
    });

    assert.ok(result);
    assert.equal(result!.relationships.length, 0);
  });

  it("returns null when no useful content", () => {
    assert.equal(
      parseOntologyExtraction({ entities: [], relationships: [], events: [] }),
      null
    );
  });

  it("resolves NM2TECH and NM2TECH LLC to same normalized form", () => {
    assert.equal(
      normalizeEntityName("NM2TECH"),
      normalizeEntityName("NM2TECH LLC").replace(" llc", "")
    );
  });
});

describe("entity resolution normalization", () => {
  it("NM2TECH LLC normalizes with llc suffix for alias matching", () => {
    const short = normalizeEntityName("NM2TECH");
    const full = normalizeEntityName("NM2TECH LLC");
    assert.equal(short, "nm2tech");
    assert.equal(full, "nm2tech llc");
    assert.equal(short, full.replace(" llc", ""));
  });
});

describe("deletion safety", () => {
  it("ontology delete only targets ontology_entities, not documents table", () => {
    const deleteSql = "from('ontology_entities').delete()";
    const documentDeleteSql = "from('documents').delete()";
    assert.notEqual(deleteSql, documentDeleteSql);
    assert.ok(deleteSql.includes("ontology_entities"));
  });
});

describe("failed extraction isolation", () => {
  it("ontology status values do not include document analysis failure states", () => {
    const ontologyStatuses = [
      "pending",
      "processing",
      "completed",
      "failed",
      "retryable",
      "skipped",
    ];
    assert.ok(!ontologyStatuses.includes("uploaded"));
    assert.ok(ontologyStatuses.includes("failed"));
  });
});

describe("formatOntologyForGideon", () => {
  it("returns (none) for empty context", () => {
    assert.equal(
      formatOntologyForGideon({
        matchedEntities: [],
        relationships: [],
        evidence: [],
        entityNames: {},
        paths: [],
      }),
      "(none)"
    );
  });

  it("formats entities, relationships, and evidence for the prompt", () => {
    const text = formatOntologyForGideon({
      matchedEntities: [
        {
          id: "e1",
          profile_id: "p1",
          entity_type: "organization",
          name: "NM2TECH LLC",
          canonical_name: "nm2tech llc",
          description: "Technology consulting company",
          properties: {},
          confidence: 0.98,
          source_type: "document",
          source_id: "d1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      relationships: [
        {
          id: "r1",
          profile_id: "p1",
          source_entity_id: "e1",
          relationship_type: "SUBCONTRACTOR_TO",
          target_entity_id: "e2",
          properties: {},
          confidence: 0.94,
          source_document_id: "d1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      evidence: [
        {
          id: "ev1",
          profile_id: "p1",
          entity_id: "e1",
          relationship_id: "r1",
          source_type: "document",
          source_id: "d1",
          document_id: "d1",
          chunk_id: null,
          evidence_text:
            "NM2TECH provides subcontracting services through Onyx Government Services.",
          page_number: null,
          confidence: 0.94,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      entityNames: {
        e1: "NM2TECH LLC",
        e2: "Onyx Government Services",
      },
      paths: [
        {
          hops: 2,
          nodeIds: ["e1", "e3", "e2"],
          nodeNames: ["NM2TECH LLC", "Prime Contract", "Onyx Government Services"],
          edges: [],
          label:
            "NM2TECH LLC —[WORKS_ON]→ Prime Contract —[AWARDED_TO]→ Onyx Government Services",
        },
      ],
    });

    assert.match(text, /MATCHED ENTITIES/);
    assert.match(text, /NM2TECH LLC \(organization\)/);
    assert.match(text, /SUBCONTRACTOR_TO/);
    assert.match(text, /Onyx Government Services/);
    assert.match(text, /PATHS \(up to 2-hop\)/);
    assert.match(text, /WORKS_ON/);
    assert.match(text, /EVIDENCE/);
    assert.match(text, /subcontracting services/);
  });

  it("builds a spoken fallback when the model returns blank", () => {
    const block = formatOntologyForGideon({
      matchedEntities: [
        {
          id: "e2",
          profile_id: "p1",
          entity_type: "organization",
          name: "Onyx Government Services",
          canonical_name: "onyx government services",
          description: null,
          properties: {},
          confidence: 0.97,
          source_type: "document",
          source_id: "d1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      relationships: [
        {
          id: "r1",
          profile_id: "p1",
          source_entity_id: "e1",
          relationship_type: "SUBCONTRACTOR_TO",
          target_entity_id: "e2",
          properties: {},
          confidence: 0.94,
          source_document_id: "d1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      evidence: [],
      entityNames: {
        e1: "NM2TECH LLC",
        e2: "Onyx Government Services",
      },
      paths: [],
    });
    const fallback = buildOntologyAnswerFallback(block);
    assert.ok(fallback);
    assert.match(fallback!, /FROM YOUR ONTOLOGY/);
    assert.match(fallback!, /Onyx Government Services/);
    assert.match(fallback!, /SUBCONTRACTOR_TO/);
  });
});

describe("reviewStatusForConfidence", () => {
  it("confirms manual and high-confidence rows", () => {
    assert.equal(reviewStatusForConfidence(0.5, "manual"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.95, "document"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.7, "document"), "pending");
  });
});
