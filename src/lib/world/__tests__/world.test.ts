import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bandFromIdentitySignal,
  extractEmailFromCandidate,
  extractPhoneFromCandidate,
  shouldAutoResolvePeople,
} from "../identitySignals.ts";
import {
  scoreEntityImportance,
  scoreTimelineImportance,
  shouldEmitTimelineEntry,
  TIMELINE_IMPORTANCE_THRESHOLD,
} from "../importance.ts";
import {
  filterEntitiesByAuthorizedSpaces,
  entityHasAuthorizedEvidence,
} from "../authFilter.ts";
import { requireEvidenceExcerpt } from "../provenanceCore.ts";
import {
  filterTimelineCandidatesForEmit,
  inferTimelineEntriesFromExtraction,
} from "../timelineInfer.ts";
import { parseSemanticExtraction } from "../../semantic/schema.ts";
import type { SemanticEntity } from "../../semantic/types.ts";

function fakeEntity(
  id: string,
  name: string,
  type = "person"
): SemanticEntity {
  return {
    id,
    user_id: "u1",
    canonical_name: name,
    entity_type: type,
    normalized_name: name.toLowerCase(),
    description: null,
    aliases: [],
    attributes: {},
    confidence: 0.9,
    first_seen_at: null,
    last_seen_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("world identity signals", () => {
  it("extracts email from attributes and aliases", () => {
    assert.equal(
      extractEmailFromCandidate({
        attributes: { email: "Jaime@OlneyMD.org" },
      }),
      "jaime@olneymd.org"
    );
    assert.equal(
      extractEmailFromCandidate({
        aliases: ["Jaime Costolo", "jaime@olneymd.org"],
      }),
      "jaime@olneymd.org"
    );
  });

  it("extracts normalized phone digits", () => {
    assert.equal(
      extractPhoneFromCandidate({ attributes: { phone: "(555) 123-4567" } }),
      "5551234567"
    );
  });

  it("resolves Jaime / Jaime Costolo / email as HIGH when email matches", () => {
    const result = shouldAutoResolvePeople({
      nameA: "Jaime",
      nameB: "Jaime Costolo",
      emailA: "jaime@olneymd.org",
      emailB: "jaime@olneymd.org",
    });
    assert.equal(result.resolve, true);
    assert.equal(result.band, "high");
    assert.equal(result.reason, "exact_email");
  });

  it("resolves exact full name as HIGH", () => {
    const result = shouldAutoResolvePeople({
      nameA: "Jaime Costolo",
      nameB: "Jaime Costolo",
    });
    assert.equal(result.resolve, true);
    assert.equal(result.band, "high");
  });

  it("does not auto-merge ambiguous first name alone", () => {
    const result = shouldAutoResolvePeople({
      nameA: "Jaime",
      nameB: "Jaime Smith",
    });
    assert.equal(result.resolve, false);
    assert.equal(result.band, "low");
    assert.equal(result.reason, "ambiguous_name");
  });

  it("fuzzy person match is MEDIUM — never silent merge", () => {
    const result = shouldAutoResolvePeople({
      nameA: "Jaime Costolo",
      nameB: "Jaime Costollo",
    });
    assert.equal(result.resolve, false);
    assert.equal(result.band, "medium");
  });

  it("bandFromIdentitySignal encodes HIGH/MEDIUM/LOW policy", () => {
    assert.equal(bandFromIdentitySignal({ kind: "email", confidence: 1 }, "person"), "high");
    assert.equal(
      bandFromIdentitySignal({ kind: "fuzzy", confidence: 0.9 }, "person"),
      "medium"
    );
    assert.equal(
      bandFromIdentitySignal({ kind: "ambiguous", confidence: 0.4 }, "person"),
      "low"
    );
    assert.equal(
      bandFromIdentitySignal({ kind: "fuzzy", confidence: 0.95 }, "organization"),
      "high"
    );
  });
});

describe("world provenance", () => {
  it("requires evidence excerpt or fallback", () => {
    assert.equal(requireEvidenceExcerpt("  quote  ", ""), "quote");
    assert.equal(requireEvidenceExcerpt(null, "fallback text"), "fallback text");
    assert.throws(() => requireEvidenceExcerpt(null, "  "), /Evidence excerpt required/);
  });
});

describe("world importance + timeline", () => {
  it("scores contracts higher than topics", () => {
    const contract = scoreEntityImportance({ entityType: "contract" });
    const topic = scoreEntityImportance({ entityType: "topic" });
    assert.ok(contract > topic);
  });

  it("emits security incident and contract timeline; skips low noise", () => {
    assert.ok(
      shouldEmitTimelineEntry(
        scoreTimelineImportance("security_incident", 0.9),
        "security_incident"
      )
    );
    assert.equal(
      shouldEmitTimelineEntry(0.4, "other_important"),
      false
    );
    assert.ok(TIMELINE_IMPORTANCE_THRESHOLD >= 0.5);
  });

  it("infers timeline from high-signal facts only", () => {
    const extraction = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "e1",
          type: "person",
          name: "Jaime Costolo",
          confidence: 0.95,
        },
      ],
      relationships: [],
      facts: [
        {
          subject: "e1",
          predicate: "description",
          valueText: "Security incident reported on campus network",
          confidence: 0.9,
          evidence: "Security incident reported on campus network",
        },
        {
          subject: "e1",
          predicate: "description",
          valueText: "Minor typo fixed in footer",
          confidence: 0.9,
          evidence: "Minor typo fixed in footer",
        },
      ],
    });
    assert.ok(extraction);
    const map = new Map([["e1", "ent-1"]]);
    const candidates = inferTimelineEntriesFromExtraction({
      extraction: extraction!,
      sourceId: "doc-1",
      tempToEntityId: map,
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]!.entryType, "security_incident");

    const emit = filterTimelineCandidatesForEmit(candidates);
    assert.equal(emit.length, 1);

    // Same source dedupe key is stable
    const again = inferTimelineEntriesFromExtraction({
      extraction: extraction!,
      sourceId: "doc-1",
      tempToEntityId: map,
    });
    assert.equal(again[0]!.dedupeKey, candidates[0]!.dedupeKey);
  });

  it("infers contract_signed from contract entity", () => {
    const extraction = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "c1",
          type: "contract",
          name: "MSA with Onyx",
          confidence: 0.95,
        },
      ],
      relationships: [],
      facts: [],
    });
    const candidates = inferTimelineEntriesFromExtraction({
      extraction: extraction!,
      sourceId: "doc-2",
      tempToEntityId: new Map([["c1", "ent-c"]]),
    });
    assert.ok(candidates.some((c) => c.entryType === "contract_signed"));
  });
});

describe("world space authorization", () => {
  it("hides entities whose only evidence is in unauthorized Space B", () => {
    const entities = [
      fakeEntity("a", "Visible Person"),
      fakeEntity("b", "Leaked Person"),
    ];
    const entityEvidenceSpaces = new Map<string, Array<string | null>>([
      ["a", ["space-a"]],
      ["b", ["space-b"]],
    ]);
    const visible = filterEntitiesByAuthorizedSpaces({
      entities,
      entityEvidenceSpaces,
      authorizedSpaceIds: new Set(["space-a"]),
    });
    assert.equal(visible.length, 1);
    assert.equal(visible[0]!.id, "a");
  });

  it("allows null-space evidence (manual / user-global)", () => {
    assert.equal(
      entityHasAuthorizedEvidence({
        evidenceSpaces: [null],
        authorizedSpaceIds: new Set(),
      }),
      true
    );
  });

  it("hides entities with no evidence", () => {
    const visible = filterEntitiesByAuthorizedSpaces({
      entities: [fakeEntity("x", "No Evidence")],
      entityEvidenceSpaces: new Map(),
      authorizedSpaceIds: new Set(["space-a"]),
    });
    assert.equal(visible.length, 0);
  });

  it("relationship crossing spaces keeps evidence-level auth", () => {
    // Entity linked to both spaces: visible if user has either authorized
    const entities = [fakeEntity("cross", "Shared Contact")];
    const entityEvidenceSpaces = new Map<string, Array<string | null>>([
      ["cross", ["space-a", "space-b"]],
    ]);
    const onlyA = filterEntitiesByAuthorizedSpaces({
      entities,
      entityEvidenceSpaces,
      authorizedSpaceIds: new Set(["space-a"]),
    });
    assert.equal(onlyA.length, 1);

    const neither = filterEntitiesByAuthorizedSpaces({
      entities,
      entityEvidenceSpaces,
      authorizedSpaceIds: new Set(["space-c"]),
    });
    assert.equal(neither.length, 0);
  });
});

describe("world vocabulary aliases", () => {
  it("normalizes place → location in extraction schema", () => {
    const parsed = parseSemanticExtraction({
      entities: [
        {
          temporaryId: "p1",
          type: "place",
          name: "Olney Campus",
          confidence: 0.9,
        },
        {
          temporaryId: "c1",
          type: "client",
          name: "Onyx Health",
          confidence: 0.9,
        },
      ],
      relationships: [],
      facts: [],
    });
    assert.ok(parsed);
    assert.equal(parsed!.entities[0]!.type, "location");
    assert.equal(parsed!.entities[1]!.type, "client");
  });
});
