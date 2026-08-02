import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDocumentAnalysisContext } from "../document-analysis-context.ts";
import { buildProactiveSuggestions } from "../proactive.ts";
import { normalizeKnowledgeKey } from "../normalize.ts";
import type { KnowledgeInput } from "../types.ts";
import type { GuardianAnalysis } from "@/lib/analysis/types";

function futureIso(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function analysisWithDueDate(isoDate: string): GuardianAnalysis {
  return {
    document_type: "invoice",
    title: "Vendor invoice",
    summary: "Payment due soon.",
    facts: [],
    important_dates: [
      {
        label: "Payment due",
        value: isoDate,
        date: isoDate,
        source_type: "document",
        confidence: 0.95,
        source_excerpt: `Due ${isoDate}`,
        page_number: 1,
        needs_verification: false,
        is_deadline: true,
      },
    ],
    people: [],
    organizations: ["Acme Corp"],
    amounts: [],
    obligations: [],
    warnings: [],
    guardian_status: "action_needed",
    suggested_actions: [],
    overall_confidence: 0.9,
    specialist: {},
  };
}

function sampleInput(
  overrides: Partial<KnowledgeInput> = {}
): KnowledgeInput {
  return {
    sourceType: "document",
    sourceId: "doc-1",
    profileId: "profile-1",
    vaultId: "profile-1",
    content: "Invoice from Acme Corp",
    metadata: { documentType: "invoice", fileName: "invoice.pdf" },
    ...overrides,
  };
}

describe("normalizeKnowledgeKey", () => {
  it("lowercases and collapses whitespace", () => {
    assert.equal(normalizeKnowledgeKey("  Acme   Corp "), "acme corp");
  });
});

describe("buildProactiveSuggestions", () => {
  it("creates deadline suggestions from upcoming important dates", () => {
    const due = futureIso(10);
    const input = sampleInput({
      analysisContext: buildDocumentAnalysisContext(analysisWithDueDate(due)),
    });
    const suggestions = buildProactiveSuggestions(
      input,
      {
        entities: [],
        suggestedMemories: [],
        suggestedTimelineEvents: [],
        suggestedRelationships: [],
      },
      { profileNames: ["NM2TECH"] }
    );

    assert.ok(
      suggestions.some(
        (s) => s.kind === "deadline" && s.title.includes("Payment due")
      )
    );
  });

  it("recommends workspace for unknown organizations", () => {
    const input = sampleInput();
    const suggestions = buildProactiveSuggestions(
      input,
      {
        entities: [
          {
            type: "organization",
            name: "New Startup LLC",
            confidence: 0.9,
          },
        ],
        suggestedMemories: [],
        suggestedTimelineEvents: [],
        suggestedRelationships: [],
      },
      { profileNames: ["NM2TECH"] }
    );

    assert.ok(
      suggestions.some(
        (s) =>
          s.kind === "workspace_recommendation" &&
          s.title.includes("New Startup LLC")
      )
    );
  });

  it("skips workspace recommendation when profile already exists", () => {
    const input = sampleInput();
    const suggestions = buildProactiveSuggestions(
      input,
      {
        entities: [
          {
            type: "organization",
            name: "Acme Corp",
            confidence: 0.9,
          },
        ],
        suggestedMemories: [],
        suggestedTimelineEvents: [],
        suggestedRelationships: [],
      },
      { profileNames: ["Acme Corp"] }
    );

    assert.equal(
      suggestions.filter((s) => s.kind === "workspace_recommendation").length,
      0
    );
  });

  it("dedupes suggestions by normalized key", () => {
    const due = futureIso(5);
    const input = sampleInput({
      analysisContext: buildDocumentAnalysisContext(analysisWithDueDate(due)),
      metadata: { documentType: "insurance", fileName: "policy.pdf" },
    });
    const analysis = input.analysisContext!;
    analysis.documentType = "insurance";

    const suggestions = buildProactiveSuggestions(input, {
      entities: [
        { type: "organization", name: "Acme Corp", confidence: 0.9 },
      ],
      suggestedMemories: [
        {
          category: "action",
          value: "Schedule payment",
          confidence: 0.8,
          importance: 0.9,
          sourceType: "document",
          sourceId: "doc-1",
        },
      ],
      suggestedTimelineEvents: [],
      suggestedRelationships: [],
    });

    const keys = suggestions.map((s) => s.normalizedKey);
    assert.equal(keys.length, new Set(keys).size);
  });
});
