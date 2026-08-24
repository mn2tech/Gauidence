/**
 * Gideon orchestration acceptance tests (knowledge-first routing + composer).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyOrchestrationDepth,
  routeGideonOrchestration,
} from "../request-router.ts";
import { resolveGuardianKnowledge } from "../knowledge-resolver.ts";
import { composeGideonResponse } from "../response-composer.ts";
import { budgetRetrievalEvidence, MAX_DIRECT_EVIDENCE } from "../evidence-budget.ts";
import { buildOrchestrationDebugSnapshot } from "../orchestration-observability.ts";
import { classifyActionKind } from "../actions/interface.ts";
import { isGlobalBriefingQuestion } from "../global-briefing.ts";

describe("Gideon orchestration — acceptance", () => {
  it("Test 1 — Direct Guardian fact: Kendall minimum investment", () => {
    const q = "What is Kendall's minimum investment?";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "kendall-space",
      spaceName: "Kendall Capital",
      knownEntityNames: ["Kendall", "Kendall Capital"],
    });
    assert.equal(route.intent, "guardian_knowledge");
    assert.equal(route.responseDepth, "short");
    assert.equal(route.guardianKnowledgeRequired, true);
    assert.equal(route.generalKnowledgeAllowed, false);

    const knowledge = resolveGuardianKnowledge({
      query: q,
      userId: "u1",
      spaceId: "kendall-space",
      layers: {
        spaceName: "Kendall Capital",
        directFacts: [
          {
            subject: "Kendall Capital",
            predicate: "listed minimum investment",
            value: "$500,000",
            confidence: 0.95,
            knowledgeSource: "guardian",
            sourceLabel: "Form CRS",
          },
        ],
      },
    });
    assert.equal(knowledge.status, "known");

    const composed = composeGideonResponse({ question: q, route, knowledge });
    assert.ok(composed.text);
    assert.match(composed.text!, /\$500,000/);
    assert.doesNotMatch(
      composed.text!,
      /\b(RIA|SEC|wealth management|typical minimum)\b/i
    );
    assert.equal(composed.responseDepth, "short");
  });

  it("Test 2 — Guardian + general: is $500,000 normal?", () => {
    const q = "Is Kendall's $500,000 minimum normal?";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "kendall-space",
      spaceName: "Kendall Capital",
      knownEntityNames: ["Kendall"],
    });
    assert.equal(route.intent, "guardian_plus_general");
    assert.equal(route.guardianKnowledgeRequired, true);
    assert.equal(route.generalKnowledgeAllowed, true);
    assert.match(composeGideonResponse({
      question: q,
      route,
      knowledge: resolveGuardianKnowledge({
        query: q,
        userId: "u1",
        layers: {
          directFacts: [
            {
              subject: "Kendall Capital",
              predicate: "minimum investment",
              value: "$500,000",
              confidence: 0.9,
              knowledgeSource: "guardian",
            },
          ],
        },
      }),
    }).systemNotes, /guardian_plus_general|GENERAL KNOWLEDGE/i);
  });

  it("Test 3 — Unknown business fact: Lagos Dental insurance", () => {
    const q = "What insurance does Lagos Dental accept?";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "lagos-space",
      spaceName: "Lagos Dental",
      knownEntityNames: ["Lagos Dental"],
    });
    assert.equal(route.intent, "guardian_knowledge");

    const knowledge = resolveGuardianKnowledge({
      query: q,
      userId: "u1",
      spaceId: "lagos-space",
      layers: { spaceName: "Lagos Dental" },
    });
    assert.equal(knowledge.status, "unknown");

    const composed = composeGideonResponse({ question: q, route, knowledge });
    assert.ok(composed.text);
    assert.match(
      composed.text!,
      /I don't have Lagos Dental's accepted insurance plans in its Space yet/i
    );
    assert.doesNotMatch(composed.text!, /\b(Delta Dental|Cigna|Aetna)\b/i);
  });

  it("Test 4 — Explain depth", () => {
    const q = "Why does Form CRS disclose conflicts of interest?";
    assert.equal(classifyOrchestrationDepth(q), "explain");
    const route = routeGideonOrchestration({ question: q });
    assert.equal(route.responseDepth, "explain");
  });

  it("Test 5 — Deep analysis", () => {
    const q =
      "Analyze Kendall's Form CRS and identify the biggest issues I should discuss with Clark.";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "kendall-space",
      knownEntityNames: ["Kendall", "Clark"],
    });
    assert.equal(route.responseDepth, "deep");
    assert.equal(route.guardianKnowledgeRequired, true);
  });

  it("Test 6 — Current Space context: services they offer", () => {
    const q = "What services do they offer?";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "kendall-space",
      spaceName: "Kendall Capital",
    });
    assert.equal(route.intent, "guardian_knowledge");
    assert.equal(route.guardianKnowledgeRequired, true);
    assert.equal(route.spaceId, "kendall-space");
    assert.match(route.reasoning ?? "", /space|guardian/i);
  });

  it("Test 7 — General question: What is an RIA?", () => {
    const route = routeGideonOrchestration({
      question: "What is an RIA?",
      spaceId: "kendall-space",
    });
    assert.equal(route.intent, "general_knowledge");
    assert.equal(route.guardianKnowledgeRequired, false);
    assert.equal(route.generalKnowledgeAllowed, true);
  });

  it("Test 8 — Conversational advice", () => {
    const route = routeGideonOrchestration({
      question: "How should I approach my meeting tomorrow?",
      spaceId: "kendall-space",
    });
    assert.ok(
      route.intent === "conversation" ||
        route.intent === "guardian_plus_general"
    );
    assert.equal(route.responseDepth, "short");
    assert.equal(route.generalKnowledgeAllowed, true);
  });

  it("song list questions require Guardian inventory", () => {
    for (const q of [
      "list the songs",
      "What songs are on The Living Waters?",
      "give me the list of songs",
      "List the JPG chord charts in this space",
    ]) {
      const route = routeGideonOrchestration({
        question: q,
        spaceId: "wednesday-practice",
        spaceName: "Wednesday Practice",
      });
      assert.equal(
        route.guardianKnowledgeRequired,
        true,
        `expected knowledge for: ${q}`
      );
      assert.equal(route.knowledgeSource, "guardian");
    }
  });

  it("Test 9 — Give me everything about Kendall", () => {
    const q = "Give me everything Guardian knows about Kendall.";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "kendall-space",
      knownEntityNames: ["Kendall"],
    });
    assert.equal(route.responseDepth, "deep");
    assert.equal(route.guardianKnowledgeRequired, true);

    const knowledge = resolveGuardianKnowledge({
      query: q,
      userId: "u1",
      spaceId: "kendall-space",
      layers: {
        spaceName: "Kendall Capital",
        entities: [{ name: "Kendall Capital", type: "organization" }],
        relationships: [
          {
            subject: "Kendall Capital",
            predicate: "SERVES",
            object: "Financial Planning",
          },
        ],
        directFacts: [
          {
            subject: "Kendall Capital",
            predicate: "minimum investment",
            value: "$500,000",
            confidence: 0.9,
            knowledgeSource: "guardian",
          },
        ],
        retrievalEvidence: [
          {
            id: "e1",
            text: "Form CRS discloses conflicts of interest.",
            score: 0.8,
            fileName: "Form CRS.pdf",
          },
        ],
      },
    });
    assert.equal(knowledge.status, "known");
    assert.ok(knowledge.entities.length >= 1);
    assert.ok(knowledge.relationships.length >= 1);
    assert.ok(knowledge.retrievalEvidence.length >= 1);
  });

  it("Test 10 — Personal Space school closure", () => {
    const q = "When is the next school closure?";
    const route = routeGideonOrchestration({
      question: q,
      spaceId: "personal",
      spaceType: "personal",
    });
    assert.equal(route.intent, "guardian_knowledge");
    assert.equal(route.responseDepth, "short");

    const knowledge = resolveGuardianKnowledge({
      query: q,
      userId: "u1",
      spaceId: "personal",
      layers: {
        spaceName: "Personal",
        directFacts: [
          {
            subject: "School",
            predicate: "next closure",
            value: "Monday, September 7 for Labor Day",
            confidence: 0.92,
            knowledgeSource: "guardian",
            sourceLabel: "School calendar",
          },
        ],
        events: [
          {
            name: "Labor Day — school closed",
            when: "2026-09-07",
          },
        ],
      },
    });
    const composed = composeGideonResponse({ question: q, route, knowledge });
    assert.ok(composed.text);
    assert.match(composed.text!, /September 7|Labor Day/i);
    assert.doesNotMatch(composed.text!, /history of Labor Day|federal holiday act/i);
  });

  it("evidence budget caps and dedupes", () => {
    assert.equal(MAX_DIRECT_EVIDENCE, 5);
    const budgeted = budgetRetrievalEvidence(
      Array.from({ length: 12 }, (_, i) => ({
        id: `c${i}`,
        text: `Chunk about fees and minimums number ${i}`,
        score: 0.9 - i * 0.05,
      }))
    );
    assert.ok(budgeted.length <= MAX_DIRECT_EVIDENCE);
  });

  it("action route and global briefing foundation", () => {
    const action = routeGideonOrchestration({
      question: "Remind me next week to follow up with Clark.",
    });
    assert.equal(action.intent, "action");
    assert.equal(classifyActionKind("Draft an email to Clark."), "draft_email");
    assert.equal(isGlobalBriefingQuestion("What do I need to know today?"), true);
  });

  it("debug snapshot is inspectable for Test Lab", () => {
    const route = routeGideonOrchestration({
      question: "What is Kendall's minimum investment?",
      spaceId: "k1",
      knownEntityNames: ["Kendall"],
    });
    const knowledge = resolveGuardianKnowledge({
      query: "What is Kendall's minimum investment?",
      userId: "u1",
      layers: {
        spaceName: "Kendall Capital",
        directFacts: [
          {
            subject: "Kendall",
            predicate: "minimum investment",
            value: "$500,000",
            confidence: 0.9,
            knowledgeSource: "guardian",
          },
        ],
      },
    });
    const snap = buildOrchestrationDebugSnapshot({
      route,
      knowledge,
      spaceName: "Kendall Capital",
      includeReasoning: true,
    });
    assert.equal(snap.intent, "guardian_knowledge");
    assert.equal(snap.responseDepth, "short");
    assert.equal(snap.knowledgeStatus, "known");
    assert.equal(snap.guardianKnowledgeRequired, true);
    assert.equal(snap.generalKnowledgeAllowed, false);
  });
});
