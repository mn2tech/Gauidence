import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractReferencedDocumentMentions,
  findMentionedButUnavailable,
  formatRelationshipProse,
  isDocumentAvailable,
} from "../evidenceBoundaries";
import { buildSuggestedQuestions } from "../suggestedQuestions";
import { formatEntity360UserAnswer } from "../business/formatForGideon";
import type { Entity360 } from "../business/types";

describe("evidenceBoundaries", () => {
  it("treats Form ADV as mentioned-but-unavailable when only CRS is available", () => {
    const evidence =
      "See Form ADV Part 2A for additional information about our fees and services.";
    const mentioned = extractReferencedDocumentMentions([evidence]);
    assert.ok(mentioned.some((m) => /Form ADV Part 2A/i.test(m)));
    assert.equal(
      isDocumentAvailable("Form ADV Part 2A", [
        "2025 Form CRS Client Relationship Summary.pdf",
      ]),
      false
    );
    const unavailable = findMentionedButUnavailable({
      evidenceTexts: [evidence],
      availableDocumentLabels: [
        "2025 Form CRS Client Relationship Summary.pdf",
      ],
    });
    assert.ok(unavailable.some((u) => /Form ADV/i.test(u)));
  });

  it("formats relationships without ontology bracket syntax", () => {
    const prose = formatRelationshipProse({
      subject: "Kendall Capital",
      type: "SERVES",
      related: "Financial Planning",
      direction: "outgoing",
    });
    assert.match(prose, /offers or serves Financial Planning/i);
    assert.doesNotMatch(prose, /\[SERVES\]/);
  });
});

describe("buildSuggestedQuestions", () => {
  it("returns contextual chips without repeating the original question", () => {
    const qs = buildSuggestedQuestions({
      question: "What do we know about Kendall Capital?",
      answer:
        "Kendall Capital offers financial planning and portfolio management. Fees are assessed quarterly. The CRS references Form ADV Part 2A, but that document is not currently available.",
      entityNames: ["Kendall Capital Management"],
      availableDocumentLabels: ["Form CRS.pdf"],
      gaps: ["Form ADV Part 2A is referenced but not available."],
      preferEvidenceOrGap: true,
    });
    assert.ok(qs.length >= 2 && qs.length <= 3);
    assert.ok(qs.every((q) => q.split(/\s+/).length <= 10));
    assert.ok(!qs.some((q) => /what do we know about kendall/i.test(q)));
    assert.ok(
      qs.some((q) => /missing|source|fees|services|money|ADV/i.test(q))
    );
    assert.ok(!qs.some((q) => /else is known in this Space|document should I add/i.test(q)));
  });

  it("suggests roster follow-ups for contact / RSVP answers", () => {
    const qs = buildSuggestedQuestions({
      question: "pull up Jeff Hunt from the roster",
      answer: `• Name: Jeff Hunt
• Email: jhunt@fca.org
• Phone: 301-943-1913
• Company: Fellowship of Christian Athletes
• Title: Field Director – Montgomery County
• RSVP'd: August 3, 2026 (confirmed, 0 guests)`,
      availableDocumentLabels: ["roster.csv"],
    });
    assert.ok(qs.length >= 2 && qs.length <= 3);
    assert.ok(qs.some((q) => /Jeff Hunt|roster|RSVP|guest list/i.test(q)));
    assert.ok(
      !qs.some((q) =>
        /else is known in this Space|Which source supports|information is missing|document should I add/i.test(
          q
        )
      )
    );
  });

  it("does not suggest business chips for unrelated personal answers", () => {
    const qs = buildSuggestedQuestions({
      question: "When is the next school closure?",
      answer:
        "School is closed Monday, September 7 for Labor Day. Want me to show the next three closures?",
      entityNames: ["Personal"],
    });
    assert.deepEqual(qs, []);
  });

  it("does not suggest chips for general definition answers", () => {
    const qs = buildSuggestedQuestions({
      question: "What is an RIA?",
      answer:
        "An RIA is a Registered Investment Adviser regulated under the Investment Advisers Act.",
    });
    assert.deepEqual(qs, []);
  });
});

describe("formatEntity360UserAnswer evidence boundaries", () => {
  it("surfaces referenced Form ADV as missing, not contained", () => {
    const entity360: Entity360 = {
      entity: {
        id: "1",
        name: "Kendall Capital Management, Inc.",
        type: "organization",
        aliases: ["Kendall Capital"],
        description:
          "SEC-registered investment adviser offering financial planning and portfolio management.",
        domain: null,
        confidence: 0.9,
      },
      relationships: [
        {
          type: "SERVES",
          direction: "outgoing",
          relatedName: "Financial Planning",
          relatedType: "service",
          relatedId: "s1",
        },
      ],
      people: [],
      proposals: [],
      projects: [],
      contracts: [],
      assessments: [
        {
          id: "d2",
          name: "Form ADV Part 2A",
          type: "document",
          summary: "Referenced for additional disclosures",
        },
      ],
      commitments: [],
      risks: [],
      recentActivity: [],
      evidence: [
        {
          id: "e1",
          text: "Please see Form ADV Part 2A for additional information about fees.",
          documentName: "2025 Form CRS.pdf",
          documentId: "doc-crs",
          sourceType: "document",
        },
      ],
      gaps: [],
    };
    const text = formatEntity360UserAnswer(entity360);
    assert.match(text, /Kendall Capital/i);
    assert.match(text, /financial planning/i);
    assert.match(text, /Missing information|not (currently )?available|reference/i);
    assert.match(text, /Form ADV Part 2A/i);
    assert.doesNotMatch(text, /Guardian contains Form ADV/i);
    assert.doesNotMatch(text, /—\[SERVES\]→/);
    assert.doesNotMatch(text, /^Relationship$/m);
    assert.doesNotMatch(text, /proposals linked|active project linked|contact people/i);
  });

  it("does not claim Form ADV is missing when the Space already has it", () => {
    const entity360: Entity360 = {
      entity: {
        id: "1",
        name: "Kendall Capital Management, Inc.",
        type: "organization",
        aliases: ["Kendall Capital"],
        description: "SEC-registered investment adviser.",
        domain: null,
        confidence: 0.9,
      },
      relationships: [],
      people: [],
      proposals: [],
      projects: [],
      contracts: [],
      assessments: [],
      commitments: [],
      risks: [],
      recentActivity: [],
      evidence: [
        {
          id: "e1",
          text: "Please see Form ADV Part 2A for additional information about fees.",
          documentName: "2025 Form CRS.pdf",
          documentId: "doc-crs",
          sourceType: "document",
        },
      ],
      gaps: [
        "Available sources reference Form ADV Part 2A, but that document does not appear to be available in this Space.",
      ],
      availableDocumentLabels: [
        "2025 Form CRS.pdf",
        "Form ADV Part 2A - Firm Disclosure Brochure - Kendall Capital Management, Inc..pdf",
        "1026427.pdf",
      ],
    };
    const text = formatEntity360UserAnswer(entity360);
    assert.doesNotMatch(text, /does not appear to be available/i);
    assert.doesNotMatch(text, /Adding Form ADV/i);
  });

  it("does not treat fee topics or CRM absences as missing documents", () => {
    const entity360: Entity360 = {
      entity: {
        id: "1",
        name: "Kendall Capital Management, Inc.",
        type: "organization",
        aliases: [],
        description: "Fee-only advisory firm.",
        domain: null,
        confidence: 0.9,
      },
      relationships: [],
      people: [],
      proposals: [],
      projects: [],
      contracts: [],
      assessments: [
        {
          id: "d3",
          name: "Asset-Based Fee Structure",
          type: "document",
          summary: "Fees vary by account value",
        },
      ],
      commitments: [],
      risks: [],
      recentActivity: [],
      evidence: [
        {
          id: "e1",
          text: "We charge an asset-based fee. See Form ADV Part 2A for details.",
          documentName: "2025 Form CRS.pdf",
          documentId: "doc-crs",
          sourceType: "document",
        },
      ],
      gaps: [
        "Guardian currently shows no matching proposals linked to this entity by client name.",
        "I could not find an active project linked to this entity in the ontology.",
        "Available sources reference Form ADV Part 2A, but that document does not appear to be available in this Space.",
      ],
    };
    const text = formatEntity360UserAnswer(entity360);
    assert.match(text, /Form ADV Part 2A/i);
    assert.doesNotMatch(text, /Asset-Based Fee Structure/i);
    assert.doesNotMatch(text, /proposals linked/i);
    assert.doesNotMatch(text, /active project linked/i);
    // Fee concept may appear in evidence prose, but not as a missing document.
    assert.doesNotMatch(
      text,
      /Available sources reference Asset-Based Fee Structure/i
    );
  });
});
