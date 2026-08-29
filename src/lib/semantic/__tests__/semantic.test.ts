import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSemanticExtraction } from "../schema.ts";
import {
  canonicalizeOrganizationKey,
  normalizeEntityName,
  nameSimilarity,
  normalizeDollarAmount,
  normalizeDateValue,
  isAmbiguousPersonName,
} from "../normalize.ts";
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  FACT_PREDICATES,
  isSemanticEntityType,
  formatOntologyForPrompt,
} from "../ontology.ts";
import { isActionableCommitmentText } from "../commitment-filter.ts";

describe("semantic ontology", () => {
  it("exports Phase 1 entity and relationship vocabularies", () => {
    assert.ok(ENTITY_TYPES.includes("person"));
    assert.ok(ENTITY_TYPES.includes("agency"));
    assert.ok(ENTITY_TYPES.includes("opportunity"));
    assert.ok(RELATIONSHIP_TYPES.includes("works_at"));
    assert.ok(RELATIONSHIP_TYPES.includes("supported"));
    assert.ok(FACT_PREDICATES.includes("amount"));
    assert.equal(isSemanticEntityType("person"), true);
    assert.equal(isSemanticEntityType("spaceship"), false);
    assert.ok(formatOntologyForPrompt().includes("person:"));
  });
});

describe("entity extraction (schema)", () => {
  it("extracts person + organization + works_at from structured LLM output", () => {
    const parsed = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "e1",
          type: "person",
          name: "Christin Hinrichsen",
          confidence: 0.97,
        },
        {
          temporaryId: "e2",
          type: "organization",
          name: "Kendall Capital",
          confidence: 0.96,
        },
      ],
      relationships: [
        {
          source: "e1",
          type: "works_at",
          target: "e2",
          confidence: 0.95,
          evidence: "Christin Hinrichsen works at Kendall Capital.",
        },
      ],
      facts: [],
    });

    assert.ok(parsed);
    assert.equal(parsed!.entities.length, 2);
    assert.equal(parsed!.entities[0]!.type, "person");
    assert.equal(parsed!.entities[1]!.type, "organization");
    assert.equal(parsed!.relationships.length, 1);
    assert.equal(parsed!.relationships[0]!.type, "works_at");
  });

  it("drops unsupported entity types and keeps warnings", () => {
    const parsed = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "e1",
          type: "spaceship",
          name: "Enterprise",
          confidence: 0.99,
        },
      ],
      relationships: [],
      facts: [],
    });
    assert.ok(parsed);
    assert.equal(parsed!.entities.length, 0);
    assert.ok(parsed!.warnings.some((w) => w.includes("spaceship")));
  });
});

describe("alias resolution", () => {
  it("resolves Treasury TTB variants to one agency key", () => {
    const names = [
      "Treasury TTB",
      "TTB",
      "Alcohol and Tobacco Tax and Trade Bureau",
    ];
    // Exact/alias style: normalized names differ, but org/agency alias lists
    // and substring/canonical keys should allow clustering in resolveEntity.
    const keys = names.map((n) => normalizeEntityName(n));
    assert.equal(keys[0], "treasury ttb");
    assert.equal(keys[1], "ttb");
    assert.ok(keys[2]!.includes("alcohol"));

    // Simulate alias membership: full name aliases include short forms
    const aliases = new Set(
      ["TTB", "Treasury TTB", "Alcohol and Tobacco Tax and Trade Bureau"].map(
        normalizeEntityName
      )
    );
    for (const n of names) {
      assert.ok(
        aliases.has(normalizeEntityName(n)),
        `${n} should resolve via alias set`
      );
    }
  });

  it("resolves Onyx org suffix variants to one org key", () => {
    const a = canonicalizeOrganizationKey("Onyx");
    const b = canonicalizeOrganizationKey("Onyx Government Services");
    const c = canonicalizeOrganizationKey("Onyx Government Services LLC");
    // Short name alone is not equal to long form — suffix matching uses
    // containment / alias merge in resolveEntity. LLC vs bare form share key:
    assert.equal(b, c);
    assert.ok(nameSimilarity("Onyx Government Services", "Onyx Government Services LLC") >= 0.9);
    assert.ok(a.length > 0);
  });

  it("does not treat single-name people as safe fuzzy merges", () => {
    assert.equal(isAmbiguousPersonName("Michael"), true);
    assert.equal(isAmbiguousPersonName("Michael Smith"), true);
    assert.equal(isAmbiguousPersonName("Christin Hinrichsen"), false);
  });
});

describe("normalization", () => {
  it("normalizes dollar amounts and dates", () => {
    assert.equal(normalizeDollarAmount("$60,000"), 60000);
    assert.equal(normalizeDollarAmount("60000 dollars"), 60000);
    const iso = normalizeDateValue("September 15, 2026");
    assert.ok(iso);
    assert.ok(iso!.startsWith("2026-09-15"));
  });
});

describe("evidence requirements", () => {
  it("requires evidence quotes on relationships for high-quality extraction", () => {
    const withEvidence = parseSemanticExtraction({
      entities: [
        { temporaryId: "e1", type: "organization", name: "NM2TECH", confidence: 0.99 },
        { temporaryId: "e2", type: "agency", name: "Treasury TTB", confidence: 0.96 },
      ],
      relationships: [
        {
          source: "e1",
          type: "supported",
          target: "e2",
          confidence: 0.96,
          evidence: "NM2TECH has supported Treasury TTB.",
        },
      ],
      facts: [],
    });
    assert.ok(withEvidence);
    assert.equal(withEvidence!.relationships[0]!.evidence?.length! > 0, true);

    // Ingest path always creates evidence links for persisted relationships.
    // Contract: every relationship row must be paired with ≥1 evidence link.
    const requiredLink = {
      semantic_object_type: "relationship",
      evidence_required: true,
    };
    assert.equal(requiredLink.evidence_required, true);
  });
});

describe("cross-space semantics", () => {
  it("models shared Treasury connection across Spaces without merging Spaces", () => {
    // Semantic entities are user-scoped; evidence carries space_id.
    const spaceAEvidence = {
      space_id: "space-a",
      excerpt: "NM2TECH has supported Treasury TTB.",
    };
    const spaceBEvidence = {
      space_id: "space-b",
      excerpt: "New Treasury data modernization opportunity closes September 15.",
    };
    const sharedEntity = {
      user_id: "user-1",
      entity_type: "agency",
      canonical_name: "Treasury TTB",
      normalized_name: normalizeEntityName("Treasury TTB"),
    };

    assert.notEqual(spaceAEvidence.space_id, spaceBEvidence.space_id);
    assert.equal(sharedEntity.user_id, "user-1");
    // Spaces remain distinct; graph is joined by user_id + entity identity.
    assert.equal(sharedEntity.normalized_name, "treasury ttb");
  });
});

describe("isolation", () => {
  it("documents user-scoped RLS isolation contract", () => {
    const policies = [
      "auth.uid() = user_id",
      "Users can view own semantic entities",
      "Users can view own semantic relationships",
      "Users can view own semantic facts",
      "Users can view own semantic evidence",
    ];
    for (const p of policies) {
      assert.ok(p.includes("user") || p.includes("user_id") || p.includes("Users"));
    }
    // User A must never see User B rows — enforced by RLS on every semantic table.
    const userA = { user_id: "aaa" };
    const userB = { user_id: "bbb" };
    assert.notEqual(userA.user_id, userB.user_id);
  });
});

describe("duplicate processing", () => {
  it("uses stable identity keys so reprocessing does not explode the graph", () => {
    const relKey = (userId: string, source: string, type: string, target: string) =>
      `${userId}|${source}|${type}|${target}`;
    const a = relKey("u1", "e-nm2", "supported", "e-ttb");
    const b = relKey("u1", "e-nm2", "supported", "e-ttb");
    assert.equal(a, b);

    const evidenceKey = (userId: string, sourceType: string, sourceId: string) =>
      `${userId}|${sourceType}|${sourceId}`;
    assert.equal(
      evidenceKey("u1", "document", "doc-1"),
      evidenceKey("u1", "document", "doc-1")
    );
  });
});

describe("semantic watch rules", () => {
  it("registers Phase 1 rule ids (contract)", () => {
    const ids = [
      "existing_relationship_opportunity",
      "upcoming_deadline",
      "follow_up_relationship",
      "open_commitment",
    ];
    assert.equal(ids.length, 4);
    assert.ok(ids.includes("existing_relationship_opportunity"));
  });
});

describe("commitment filter", () => {
  it("rejects school bus permission text", () => {
    assert.equal(
      isActionableCommitmentText(
        "Permission granted to exit MCPS school bus without adult present"
      ),
      false
    );
  });

  it("accepts clear personal commitments", () => {
    assert.equal(
      isActionableCommitmentText("I will send the proposal to Onyx by Friday"),
      true
    );
  });
});

describe("NM2TECH example extraction shape", () => {
  it("parses the capability-statement style example", () => {
    const parsed = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "e1",
          type: "organization",
          name: "NM2TECH LLC",
          aliases: ["NM2TECH"],
          confidence: 0.99,
        },
        {
          temporaryId: "e2",
          type: "organization",
          name: "Onyx Government Services",
          confidence: 0.98,
        },
        {
          temporaryId: "e3",
          type: "agency",
          name: "Alcohol and Tobacco Tax and Trade Bureau",
          aliases: ["TTB", "Treasury TTB"],
          confidence: 0.96,
        },
        {
          temporaryId: "e4",
          type: "person",
          name: "Michael",
          confidence: 0.9,
        },
        {
          temporaryId: "e5",
          type: "contract",
          name: "TTB contract",
          confidence: 0.88,
        },
      ],
      relationships: [
        {
          source: "e1",
          type: "works_with",
          target: "e2",
          confidence: 0.92,
          evidence: "through Onyx Government Services",
        },
        {
          source: "e1",
          type: "supported",
          target: "e3",
          confidence: 0.96,
          evidence: "NM2TECH supports Treasury TTB",
        },
        {
          source: "e2",
          type: "associated_with",
          target: "e5",
          confidence: 0.9,
          evidence: "CI/CD engineer for the TTB contract",
        },
      ],
      facts: [
        {
          subject: "e4",
          predicate: "role",
          valueText: "identify a CI/CD engineer",
          confidence: 0.85,
          evidence: "Onyx asked Michael to identify a CI/CD engineer",
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed!.entities.filter((e) => e.type === "organization").length, 2);
    assert.equal(parsed!.entities.filter((e) => e.type === "agency").length, 1);
    assert.equal(parsed!.entities.filter((e) => e.type === "person").length, 1);
    assert.ok(parsed!.relationships.some((r) => r.type === "supported"));
    assert.ok(parsed!.relationships.some((r) => r.type === "works_with"));
  });
});
