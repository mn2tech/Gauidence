import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveGideonLoadWithOrchestration } from "../orchestrator.ts";
import { classifyGideonIntent } from "../intent.ts";
import { routeGideonOrchestration } from "../request-router.ts";
import { resolveReferences } from "../runtime/resolveReferences.ts";

describe("resolveGideonLoadWithOrchestration", () => {
  it("keeps documents on for list-the-songs even if orchestration was weak", () => {
    const question = "list the songs";
    const capabilityRoute = classifyGideonIntent({ question });
    // Simulate older orchestration that missed song lists.
    const orchestration = {
      ...routeGideonOrchestration({ question }),
      guardianKnowledgeRequired: false,
      intent: "conversation" as const,
      knowledgeSource: "general" as const,
    };
    assert.equal(capabilityRoute.capabilities.guardianKnowledge, true);
    const load = resolveGideonLoadWithOrchestration({
      capabilityRoute,
      orchestration,
    });
    assert.equal(load.documents, true);
  });

  it("loads documents when orchestration requires guardian knowledge", () => {
    const question = "list the songs";
    const capabilityRoute = classifyGideonIntent({ question });
    const orchestration = routeGideonOrchestration({
      question,
      spaceId: "wp",
      spaceName: "Wednesday Practice",
    });
    assert.equal(orchestration.guardianKnowledgeRequired, true);
    const load = resolveGideonLoadWithOrchestration({
      capabilityRoute,
      orchestration,
    });
    assert.equal(load.documents, true);
  });

  it("loads documents for bare school calendar in a space", () => {
    const question = "school calendar";
    const capabilityRoute = classifyGideonIntent({ question });
    const orchestration = routeGideonOrchestration({
      question,
      spaceId: "nolan",
      spaceName: "Nolan Kola",
    });
    assert.equal(orchestration.guardianKnowledgeRequired, true);
    assert.equal(capabilityRoute.capabilities.guardianKnowledge, true);
    const load = resolveGideonLoadWithOrchestration({
      capabilityRoute,
      orchestration,
    });
    assert.equal(load.documents, true);
  });

  it("loads Guardian evidence for a short all-spaces entity count", () => {
    const question = "how many churches?";
    const orchestration = routeGideonOrchestration({
      question,
      spaceId: "my-business",
      spaceName: "My Business",
      globalView: true,
    });
    const capabilityRoute = classifyGideonIntent({
      question,
      forceKnowledge: orchestration.guardianKnowledgeRequired,
    });
    const load = resolveGideonLoadWithOrchestration({
      capabilityRoute,
      orchestration,
    });

    assert.equal(orchestration.guardianKnowledgeRequired, true);
    assert.equal(capabilityRoute.capabilities.guardianKnowledge, true);
    assert.equal(load.documents, true);
    assert.equal(load.vaultMap, true);
  });

  it("automatically retrieves for a terse knowledge follow-up", () => {
    const resolution = resolveReferences({
      message: "pastor names",
      activeEntities: [],
      recentMessages: [
        {
          role: "assistant",
          content: "Word Ministries of India has 12 churches.",
        },
      ],
    });
    const orchestration = routeGideonOrchestration({
      question: resolution.resolvedMessage,
      spaceId: "my-business",
      globalView: true,
    });
    const capabilityRoute = classifyGideonIntent({
      question: resolution.resolvedMessage,
      forceKnowledge: orchestration.guardianKnowledgeRequired,
    });
    const load = resolveGideonLoadWithOrchestration({
      capabilityRoute,
      orchestration,
    });

    assert.equal(resolution.conversationContinuity, false);
    assert.equal(orchestration.guardianKnowledgeRequired, true);
    assert.equal(load.documents, true);
  });
});
