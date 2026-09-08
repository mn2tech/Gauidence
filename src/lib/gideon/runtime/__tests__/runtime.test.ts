/**
 * Gideon Conversation Runtime v1 — unit + conversation scenario tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyStatePatch,
  classifyRuntimeIntent,
  createMemoryStore,
  emptyConversationState,
  extractEntitiesFromMessage,
  inferActiveGoal,
  prepareGideonTurn,
  resolveReferences,
  runGideonTurn,
  summarizeConversation,
  upsertActiveEntities,
  entityMatchesAlias,
} from "../index.ts";
import type { ActiveEntity, ConversationState } from "../types.ts";

const NOW = "2026-09-06T14:00:00.000Z";

describe("Conversation Runtime — initialization", () => {
  it("1. new conversation initializes correctly", async () => {
    const store = createMemoryStore();
    const result = await runGideonTurn({
      userId: "user-a",
      conversationId: "conv-1",
      message: "Hello",
      store,
      executePipeline: async (ctx) => {
        assert.equal(ctx.activeEntities.length, 0);
        assert.equal(ctx.activeGoal, null);
        return { answer: "Hi there." };
      },
    });
    assert.equal(result.conversationId, "conv-1");
    assert.equal(result.state.user_id, "user-a");
    assert.equal(result.state.active_entities.length, 0);
    assert.ok(result.state.conversation_summary || result.answer);
  });
});

describe("Conversation Runtime — entities", () => {
  it("2. active entity is added", () => {
    const extracted = extractEntitiesFromMessage("Find BPM 57598.", NOW);
    assert.ok(extracted.some((e) => e.canonical_id === "BPM 57598"));
    const state = emptyConversationState("u", "c", NOW);
    const next = applyStatePatch(
      state,
      { active_entities: extracted },
      NOW
    );
    assert.equal(next.active_entities.length, 1);
    assert.equal(next.active_entities[0]!.type, "solicitation");
  });

  it("3. repeated entity is deduplicated", () => {
    const a: ActiveEntity = {
      type: "solicitation",
      name: "BPM 57598",
      canonical_id: "BPM 57598",
      confidence: 0.9,
      aliases: ["BPM57598"],
      last_referenced_at: NOW,
    };
    const b: ActiveEntity = {
      type: "solicitation",
      name: "Statewide Cybersecurity Resources",
      canonical_id: "BPM 57598",
      confidence: 0.98,
      aliases: ["the solicitation"],
      last_referenced_at: NOW,
    };
    const merged = upsertActiveEntities([a], [b], NOW);
    assert.equal(merged.length, 1);
    assert.ok(
      merged[0]!.canonical_id === "BPM 57598" ||
        /57598|Cybersecurity/i.test(merged[0]!.name)
    );
  });

  it("4. aliases resolve correctly", () => {
    const chamber: ActiveEntity = {
      type: "organization",
      name: "Olney Chamber of Commerce",
      confidence: 0.97,
      aliases: ["Chamber", "Olney Chamber", "the Chamber"],
      last_referenced_at: NOW,
    };
    assert.equal(entityMatchesAlias(chamber, "Chamber"), true);
    assert.equal(entityMatchesAlias(chamber, "the Chamber"), true);
    assert.equal(entityMatchesAlias(chamber, "Other Org"), false);
  });
});

describe("Conversation Runtime — isolation", () => {
  it("5. state remains user-scoped", async () => {
    const store = createMemoryStore({
      states: [
        {
          ...emptyConversationState("user-a", "shared-uuid", NOW),
          active_entities: [
            {
              type: "organization",
              name: "Secret Corp",
              confidence: 0.99,
              last_referenced_at: NOW,
            },
          ],
        },
      ],
    });

    // User B loads same conversation id — store key is user-scoped so empty
    const loaded = await store.load("user-b", "shared-uuid");
    assert.equal(loaded, null);

    const result = await runGideonTurn({
      userId: "user-b",
      conversationId: "shared-uuid",
      message: "Are we qualified?",
      store,
      executePipeline: async (ctx) => {
        assert.equal(
          ctx.activeEntities.some((e) => e.name === "Secret Corp"),
          false
        );
        return { answer: "I need more context." };
      },
    });
    assert.equal(result.state.user_id, "user-b");
    assert.equal(
      result.state.active_entities.some((e) => e.name === "Secret Corp"),
      false
    );
  });

  it("Scenario F: User B denied access to User A conversation state", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "user-a",
      conversationId: "conv-a",
      message: "Find BPM 57598.",
      store,
      executePipeline: async () => ({ answer: "Found BPM 57598." }),
    });
    const aState = await store.load("user-a", "conv-a");
    assert.ok(aState);
    assert.ok(aState!.active_entities.length >= 1);

    const bState = await store.load("user-b", "conv-a");
    assert.equal(bState, null);
  });
});

describe("Conversation Runtime — summary and goals", () => {
  it("6. conversation summary updates", () => {
    const summary = summarizeConversation({
      previousSummary: null,
      recentMessages: [],
      activeGoal: "Evaluate BPM 57598",
      activeEntities: [
        {
          type: "solicitation",
          name: "BPM 57598",
          canonical_id: "BPM 57598",
          confidence: 0.98,
        },
      ],
      lastUserMessage: "Are we qualified?",
      lastAssistantMessage: "Checking qualification...",
    });
    assert.match(summary, /BPM 57598/);
    assert.match(summary, /qualified|Goal/i);
  });

  it("7. active goal persists on follow-up", () => {
    const intent = classifyRuntimeIntent("Are we qualified?", {
      hadPriorContext: true,
    });
    const goal = inferActiveGoal({
      message: "Are we qualified?",
      intent,
      previousGoal: "Evaluate Maryland cybersecurity solicitation",
      entityNames: ["BPM 57598", "NM2TECH"],
    });
    assert.equal(goal, "Evaluate Maryland cybersecurity solicitation");
  });

  it("8. active goal changes when appropriate", () => {
    const intent = classifyRuntimeIntent("Who is Jaime?", {
      hadPriorContext: true,
    });
    assert.equal(intent, "person_lookup");
    const goal = inferActiveGoal({
      message: "Who is Jaime?",
      intent,
      previousGoal: "Evaluate Maryland cybersecurity solicitation",
      entityNames: ["Jaime"],
    });
    assert.match(goal ?? "", /person|Jaime/i);
  });

  it("9. pending actions persist", async () => {
    const store = createMemoryStore();
    // Seed solicitation context
    store.states.set("user-a::conv-1", {
      ...emptyConversationState("user-a", "conv-1", NOW),
      active_entities: [
        {
          type: "solicitation",
          name: "BPM 57598",
          canonical_id: "BPM 57598",
          confidence: 0.98,
          last_referenced_at: NOW,
        },
        {
          type: "organization",
          name: "NM2TECH",
          confidence: 0.99,
          aliases: ["we", "our"],
          last_referenced_at: NOW,
        },
      ],
      active_goal: "Evaluate BPM 57598",
    });

    const result = await runGideonTurn({
      userId: "user-a",
      conversationId: "conv-1",
      message: "Help me respond.",
      store,
      executePipeline: async () => ({ answer: "Here is a draft." }),
    });
    assert.ok(
      result.state.pending_actions.some(
        (a) =>
          a.type === "respond_to_solicitation" || a.type === "draft_response"
      )
    );
  });

  it("10. runtime failure falls back safely", async () => {
    const store = createMemoryStore();
    store.load = async () => {
      throw new Error("simulated state load failure");
    };
    const result = await runGideonTurn({
      userId: "user-a",
      conversationId: "conv-x",
      message: "What is 2+2?",
      store,
      executePipeline: async (ctx) => {
        assert.equal(ctx.resolvedMessage, "What is 2+2?");
        return { answer: "4" };
      },
    });
    assert.equal(result.fellBack, true);
    assert.equal(result.answer, "4");
  });
});

describe("Conversation Runtime — scenarios", () => {
  it("Scenario A: Are we qualified? resolves BPM 57598", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "Find BPM 57598.",
      currentSpaceId: "space-federal",
      store,
      executePipeline: async (ctx) => {
        assert.ok(
          ctx.activeEntities.some((e) => e.canonical_id === "BPM 57598")
        );
        return {
          answer: "BPM 57598 is the Statewide Cybersecurity Resources solicitation.",
          discoveredEntities: [
            {
              type: "solicitation",
              name: "Statewide Cybersecurity Resources",
              canonical_id: "BPM 57598",
              confidence: 0.98,
              aliases: ["the solicitation"],
            },
            {
              type: "organization",
              name: "NM2TECH",
              confidence: 0.99,
              aliases: ["we", "our"],
            },
          ],
        };
      },
    });

    const second = await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "Are we qualified?",
      currentSpaceId: "space-federal",
      store,
      executePipeline: async (ctx) => {
        assert.match(ctx.resolvedMessage, /NM2TECH|BPM 57598|Cybersecurity/i);
        assert.ok(
          ctx.activeEntities.some((e) => /57598|Cybersecurity/i.test(e.name) || e.canonical_id === "BPM 57598")
        );
        return { answer: "Qualification analysis for BPM 57598..." };
      },
    });
    assert.equal(second.runtime.resolutionSuccess, true);
    assert.ok(
      second.state.active_goal,
      "goal should persist"
    );
  });

  it("Scenario B: they → Olney Chamber", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "b",
      message: "Tell me about Olney Chamber.",
      store,
      executePipeline: async () => ({
        answer: "Olney Chamber of Commerce is a local business group.",
      }),
    });
    const second = await runGideonTurn({
      userId: "u",
      conversationId: "b",
      message: "Did they contact us again?",
      store,
      executePipeline: async (ctx) => {
        assert.match(ctx.resolvedMessage, /Olney Chamber/i);
        return { answer: "No recent contact on file." };
      },
    });
    assert.equal(second.runtime.resolutionSuccess, true);
  });

  it("Scenario C: she → Jaime", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "Who is Jaime?",
      store,
      executePipeline: async () => ({
        answer: "Jaime is a contact from Kendall.",
      }),
    });
    const second = await runGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "What did she ask about Sarah?",
      store,
      executePipeline: async (ctx) => {
        assert.match(ctx.resolvedMessage, /Jaime/i);
        return { answer: "Jaime asked about Sarah's availability." };
      },
    });
    assert.equal(second.runtime.resolutionSuccess, true);
  });

  it("Scenario D: it → Kendall proposal", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "d",
      message: "Review the Kendall proposal.",
      store,
      executePipeline: async () => ({
        answer: "The Kendall proposal is lengthy.",
      }),
    });
    const second = await runGideonTurn({
      userId: "u",
      conversationId: "d",
      message: "Make it shorter.",
      store,
      executePipeline: async (ctx) => {
        assert.match(ctx.resolvedMessage, /Kendall|proposal/i);
        return { answer: "Here is a shorter draft." };
      },
    });
    assert.equal(second.runtime.resolutionSuccess, true);
  });

  it("Scenario E: entities do not leak between conversations", async () => {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "conv-1",
      message: "Review the Kendall proposal.",
      store,
      executePipeline: async () => ({ answer: "Reviewed Kendall." }),
    });
    await runGideonTurn({
      userId: "u",
      conversationId: "conv-2",
      message: "Tell me about Olney Chamber.",
      store,
      executePipeline: async (ctx) => {
        assert.equal(
          ctx.activeEntities.some((e) => /Kendall/i.test(e.name)),
          false
        );
        return { answer: "Olney Chamber info." };
      },
    });
    const c1 = await store.load("u", "conv-1");
    const c2 = await store.load("u", "conv-2");
    assert.ok(c1!.active_entities.some((e) => /Kendall/i.test(e.name)));
    assert.ok(c2!.active_entities.some((e) => /Chamber/i.test(e.name)));
    assert.equal(
      c2!.active_entities.some((e) => /Kendall/i.test(e.name)),
      false
    );
  });

  it("ambiguous he with two people asks clarification", () => {
    const entities: ActiveEntity[] = [
      {
        type: "person",
        name: "Alex",
        confidence: 0.9,
        last_referenced_at: NOW,
      },
      {
        type: "person",
        name: "Blake",
        confidence: 0.9,
        last_referenced_at: NOW,
      },
    ];
    const resolution = resolveReferences({
      message: "Did he respond?",
      activeEntities: entities,
    });
    assert.equal(resolution.ambiguous, true);
    assert.ok(resolution.clarificationPrompt);
  });
});

describe("resolveReferences — unit", () => {
  it("short reply 20% continues assistant battery question (not a Space search)", () => {
    const history = [
      {
        role: "assistant" as const,
        content:
          "If you tell me your current battery %, I can help you decide whether to skip the stop and go straight to the island.",
      },
    ];
    const r = resolveReferences({
      message: "20%",
      activeEntities: [],
      recentMessages: history,
    });
    assert.equal(r.success, true);
    assert.equal(r.conversationContinuity, true);
    assert.match(r.resolvedMessage, /20%/);
    assert.match(r.resolvedMessage, /battery|island|previous/i);
    assert.match(r.resolvedMessage, /Do not search Spaces/i);
  });

  it("yes please continues a Daily Log offer without becoming an inventory query", () => {
    const history = [
      {
        role: "assistant" as const,
        content:
          "Ready to Create a Daily Log? I can set up a Matthew's Tutoring Progress Tracker. This keeps everything in one place. Should I create that log now?",
      },
    ];
    const r = resolveReferences({
      message: "yes please",
      activeEntities: [],
      recentMessages: history,
    });
    assert.equal(r.conversationContinuity, true);
    assert.match(r.resolvedMessage, /yes please/i);
    assert.match(r.resolvedMessage, /Daily Log|Tutoring Progress/i);
  });

  it("short reply 20% uses last_assistant_message when history is empty", () => {
    const r = resolveReferences({
      message: "20%",
      activeEntities: [],
      recentMessages: [],
      lastAssistantMessage:
        "If you tell me your current battery %, I can help you decide whether to skip the stop and go straight to the island.",
    });
    assert.equal(r.conversationContinuity, true);
    assert.match(r.resolvedMessage, /20%/);
    assert.match(r.resolvedMessage, /battery|island|previous/i);
  });

  it("prepareGideonTurn keeps continuity when state save fails", async () => {
    const store = createMemoryStore();
    store.save = async () => {
      throw new Error("simulated save failure");
    };
    const prepared = await prepareGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "20%",
      recentMessages: [
        {
          role: "assistant",
          content:
            "If you tell me your current battery %, I can help you decide whether to skip the stop and go straight to the island.",
        },
      ],
      store,
    });
    assert.equal(prepared.fellBack, false);
    assert.equal(prepared.context.preferConversationContinuity, true);
    assert.match(prepared.context.resolvedMessage, /20%/);
  });

  it("prepareGideonTurn preserves short-reply continuity on load failure", async () => {
    const store = createMemoryStore();
    store.load = async () => {
      throw new Error("simulated state load failure");
    };
    const prepared = await prepareGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "20%",
      recentMessages: [
        {
          role: "assistant",
          content:
            "If you tell me your current battery %, I can help you decide whether to skip the stop and go straight to the island.",
        },
      ],
      store,
    });
    assert.equal(prepared.fellBack, true);
    assert.equal(prepared.context.preferConversationContinuity, true);
    assert.match(prepared.context.resolvedMessage, /Do not search Spaces/i);
  });

  it("builds qualification query from org + solicitation", () => {
    const entities: ActiveEntity[] = [
      {
        type: "solicitation",
        name: "Statewide Cybersecurity Resources",
        canonical_id: "BPM 57598",
        confidence: 0.98,
        aliases: ["the solicitation"],
        last_referenced_at: NOW,
      },
      {
        type: "organization",
        name: "NM2TECH",
        confidence: 0.99,
        aliases: ["we", "our"],
        last_referenced_at: NOW,
      },
    ];
    const r = resolveReferences({
      message: "Are we qualified?",
      activeEntities: entities,
    });
    assert.match(r.resolvedMessage, /NM2TECH/);
    assert.match(r.resolvedMessage, /BPM 57598|Cybersecurity/);
    assert.equal(r.success, true);
  });
});
