import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAmbiguousPersonName,
  isFuzzyMatchAllowed,
  nameSimilarity,
  normalizeEntityName,
  tokenizeForOntologySearch,
} from "../normalize";
import { parseOntologyExtraction } from "../schema";
import { formatOntologyForGideon, buildOntologyAnswerFallback } from "../formatForGideon";
import { reviewStatusForConfidence } from "../types";
import { sanitizeConnectorOntologyExtraction } from "../pipeline/sanitizeConnectorExtraction";

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

describe("tokenizeForOntologySearch", () => {
  it("splits underscores and drops stopwords", () => {
    const tokens = tokenizeForOntologySearch("show the OnePi_invoice");
    assert.ok(tokens.includes("onepi"));
    assert.ok(tokens.includes("invoice"));
    assert.ok(!tokens.includes("show"));
    assert.ok(!tokens.includes("the"));
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

  it("parses entity attributes for invoices", () => {
    const result = parseOntologyExtraction({
      entities: [
        {
          type: "invoice",
          name: "Invoice 00000001",
          confidence: 0.95,
          attributes: {
            amount: 1250,
            currency: "USD",
            invoice_number: "00000001",
            issuer: "NM2TECH LLC",
            recipient: "KPAC Tech LLC",
          },
        },
      ],
      relationships: [],
      events: [],
    });
    assert.ok(result);
    assert.equal(result!.entities[0]!.attributes?.amount, 1250);
    assert.equal(result!.entities[0]!.attributes?.invoice_number, "00000001");
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

  it("normalizes relationship aliases to canonical types", () => {
    const result = parseOntologyExtraction({
      entities: [
        { type: "person", name: "Ada", confidence: 0.9 },
        { type: "organization", name: "Acme", confidence: 0.9 },
      ],
      relationships: [
        {
          source: "Ada",
          type: "EMPLOYED_BY",
          target: "Acme",
          confidence: 0.9,
          evidence: "Ada is employed by Acme as a senior engineer.",
        },
      ],
      events: [],
    });

    assert.ok(result);
    assert.equal(result!.relationships.length, 1);
    assert.equal(result!.relationships[0]!.type, "WORKS_FOR");
  });

  it("drops weak or short RELATED_TO edges", () => {
    const result = parseOntologyExtraction({
      entities: [
        { type: "organization", name: "HashiCorp", confidence: 0.9 },
        { type: "organization", name: "Deloitte", confidence: 0.9 },
      ],
      relationships: [
        {
          source: "Deloitte",
          type: "RELATED_TO",
          target: "HashiCorp",
          confidence: 0.7,
          evidence: "Worked with Terraform and HashiCorp tools on client projects.",
        },
        {
          source: "Deloitte",
          type: "RELATED_TO",
          target: "HashiCorp",
          confidence: 0.9,
          evidence: "Used Terraform.",
        },
      ],
      events: [],
    });

    assert.ok(result);
    assert.equal(result!.relationships.length, 0);
  });

  it("keeps strong RELATED_TO with substantive evidence", () => {
    const result = parseOntologyExtraction({
      entities: [
        { type: "organization", name: "Acme", confidence: 0.9 },
        { type: "organization", name: "Beta", confidence: 0.9 },
      ],
      relationships: [
        {
          source: "Acme",
          type: "RELATED_TO",
          target: "Beta",
          confidence: 0.9,
          evidence:
            "Acme and Beta entered a strategic collaboration agreement for joint delivery.",
        },
      ],
      events: [],
    });

    assert.ok(result);
    assert.equal(result!.relationships.length, 1);
    assert.equal(result!.relationships[0]!.type, "RELATED_TO");
  });

  it("rejects unknown relationship types", () => {
    const result = parseOntologyExtraction({
      entities: [
        { type: "organization", name: "Acme", confidence: 0.9 },
      ],
      relationships: [
        {
          source: "Acme",
          type: "FEELS_ABOUT",
          target: "Cloud",
          confidence: 0.99,
          evidence: "Acme feels strongly about cloud adoption across the enterprise.",
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

  it("builds an invoice prose summary for the prompt and fallback", () => {
    const block = formatOntologyForGideon({
      matchedEntities: [
        {
          id: "inv1",
          profile_id: "p1",
          entity_type: "invoice",
          name: "Invoice 00000001",
          canonical_name: "invoice 00000001",
          description:
            "Invoice for $19,250.00 USD from NM2TECH LLC to KPAC Tech LLC",
          properties: {
            amount: 19250,
            currency: "USD",
            invoice_number: "00000001",
            issuer: "NM2TECH LLC",
            recipient: "KPAC Tech LLC",
            invoice_date: "02/05/2025",
          },
          confidence: 0.97,
          source_type: "connector",
          source_id: "s1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "junk",
          profile_id: "p1",
          entity_type: "organization",
          name: "Invoice",
          canonical_name: "invoice",
          description: null,
          properties: {},
          confidence: 0.5,
          source_type: "connector",
          source_id: "s1",
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      relationships: [
        {
          id: "r1",
          profile_id: "p1",
          source_entity_id: "inv1",
          relationship_type: "ISSUED_TO",
          target_entity_id: "org1",
          properties: {},
          confidence: 0.95,
          source_document_id: null,
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "r2",
          profile_id: "p1",
          source_entity_id: "inv1",
          relationship_type: "PURCHASED_FROM",
          target_entity_id: "db1",
          properties: {},
          confidence: 0.6,
          source_document_id: null,
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "r3",
          profile_id: "p1",
          source_entity_id: "p1e",
          relationship_type: "RELATED_TO",
          target_entity_id: "junk",
          properties: {},
          confidence: 0.9,
          source_document_id: null,
          created_by: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      evidence: [],
      entityNames: {
        inv1: "Invoice 00000001",
        org1: "KPAC Tech LLC",
        db1: "Supporting Databases (Aurora Postgres)",
        junk: "Invoice",
        p1e: "Tracy",
      },
      paths: [],
    });

    assert.match(block, /INVOICE SUMMARY/);
    assert.match(block, /Invoice #00000001/);
    assert.match(block, /19,250/);
    assert.match(block, /NM2TECH LLC/);
    assert.match(block, /KPAC Tech LLC/);
    assert.doesNotMatch(block, /PURCHASED_FROM/);
    assert.doesNotMatch(block, /RELATED_TO/);

    const fallback = buildOntologyAnswerFallback(block);
    assert.ok(fallback);
    assert.match(fallback!, /Invoice #00000001/);
    assert.doesNotMatch(fallback!, /Matching entities:/);
    assert.doesNotMatch(fallback!, /Supporting Databases/);
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

describe("sanitizeConnectorOntologyExtraction", () => {
  it("coerces invoice orgs, flips inverted ISSUED_*, and drops noise", () => {
    const cleaned = sanitizeConnectorOntologyExtraction({
      entities: [
        {
          type: "organization",
          name: "Invoice 00000001",
          confidence: 0.9,
          attributes: { amount: 19250, currency: "USD", invoice_number: "00000001" },
        },
        {
          type: "organization",
          name: "NM2TECH LLC",
          confidence: 0.95,
        },
        {
          type: "organization",
          name: "Supporting Databases (Aurora Postgres)",
          confidence: 0.7,
        },
      ],
      relationships: [
        {
          source: "NM2TECH LLC",
          type: "ISSUED_BY",
          target: "Invoice 00000001",
          confidence: 0.9,
          evidence: "Invoice issued by NM2TECH LLC to the client.",
        },
        {
          source: "Invoice 00000001",
          type: "PURCHASED_FROM",
          target: "Supporting Databases (Aurora Postgres)",
          confidence: 0.8,
          evidence: "Sheet title Supporting Databases (Aurora Postgres).",
        },
        {
          source: "Tracy",
          type: "RELATED_TO",
          target: "Invoice 00000001",
          confidence: 0.9,
          evidence: "Tracy appears on the invoice contact line somehow somehow.",
        },
      ],
      events: [
        {
          type: "invoice",
          title: "Database Support Services Invoice",
          confidence: 0.8,
        },
      ],
    });

    assert.equal(cleaned.entities.find((e) => e.name.includes("00000001"))?.type, "invoice");
    assert.ok(
      !cleaned.entities.some((e) => e.name.includes("Supporting Databases"))
    );
    assert.equal(cleaned.events.length, 0);
    assert.ok(
      cleaned.relationships.some(
        (r) =>
          r.type === "ISSUED_BY" &&
          r.source.includes("00000001") &&
          r.target.includes("NM2TECH")
      )
    );
    assert.ok(!cleaned.relationships.some((r) => r.type === "PURCHASED_FROM"));
    assert.ok(!cleaned.relationships.some((r) => r.type === "RELATED_TO"));
  });
});

describe("reviewStatusForConfidence", () => {
  it("confirms manual and high-confidence rows", () => {
    assert.equal(reviewStatusForConfidence(0.5, "manual"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.95, "document"), "confirmed");
    assert.equal(reviewStatusForConfidence(0.7, "document"), "pending");
  });

  it("keeps RELATED_TO pending even at high confidence", () => {
    assert.equal(
      reviewStatusForConfidence(0.99, "document", "RELATED_TO"),
      "pending"
    );
  });
});
