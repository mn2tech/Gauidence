/**
 * Smoothness benchmark for Conversation Runtime v1.
 * Tracks conceptual metrics across fixed multi-turn scenarios.
 *
 * Target: 90%+ correct contextual interpretation across scenarios.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryStore,
  resolveReferences,
  runGideonTurn,
} from "../index.ts";
import type { ActiveEntity } from "../types.ts";

type Check = {
  name: string;
  category:
    | "contextual_follow_up"
    | "entity_resolution"
    | "unnecessary_clarification"
    | "conversation_isolation"
    | "retrieval_continuity"
    | "fallback_reliability";
  pass: boolean;
};

const NOW = "2026-09-06T15:00:00.000Z";

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // --- Scenario A ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "Find the Statewide Cybersecurity Resources solicitation.",
      store,
      executePipeline: async () => ({
        answer: "Found BPM 57598.",
        discoveredEntities: [
          {
            type: "solicitation",
            name: "Statewide Cybersecurity Resources",
            canonical_id: "BPM 57598",
            confidence: 0.98,
            aliases: ["the solicitation", "Maryland cybersecurity"],
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
      }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "Are we qualified?",
      store,
      executePipeline: async () => ({
        answer: "Analyzing qualification.",
      }),
    });
    const resolvedA = t2.context.resolvedMessage;
    checks.push({
      name: "A1 follow-up resolves solicitation",
      category: "contextual_follow_up",
      pass: /BPM 57598|Cybersecurity/i.test(resolvedA),
    });
    checks.push({
      name: "A2 follow-up resolves organization we",
      category: "entity_resolution",
      pass: /NM2TECH/i.test(resolvedA),
    });
    checks.push({
      name: "A3 no unnecessary clarification",
      category: "unnecessary_clarification",
      pass: !t2.context.needsClarification,
    });
    checks.push({
      name: "A4 goal persists",
      category: "retrieval_continuity",
      pass: Boolean(t2.state.active_goal),
    });

    const t3 = await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "What are we missing?",
      store,
      executePipeline: async (ctx) => ({
        answer: "Gaps listed.",
      }),
    });
    checks.push({
      name: "A5 third turn keeps subject",
      category: "contextual_follow_up",
      pass: /BPM 57598|Cybersecurity|NM2TECH/i.test(t3.context.resolvedMessage),
    });

    const t4 = await runGideonTurn({
      userId: "u",
      conversationId: "a",
      message: "Draft what we should submit.",
      store,
      executePipeline: async (ctx) => ({
        answer: "Draft response.",
      }),
    });
    checks.push({
      name: "A6 drafting keeps entities",
      category: "retrieval_continuity",
      pass:
        t4.state.active_entities.some(
          (e) => e.canonical_id === "BPM 57598" || /Cybersecurity/i.test(e.name)
        ) && /BPM 57598|Cybersecurity|NM2TECH|respond/i.test(t4.context.resolvedMessage),
    });
  }

  // --- Scenario B ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "b",
      message: "Tell me about Olney Chamber.",
      store,
      executePipeline: async () => ({ answer: "Chamber overview." }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "b",
      message: "Did they contact us again?",
      store,
      executePipeline: async () => ({ answer: "No." }),
    });
    checks.push({
      name: "B1 they → Chamber",
      category: "entity_resolution",
      pass: /Olney Chamber/i.test(t2.context.resolvedMessage),
    });
    checks.push({
      name: "B2 no clarification for clear they",
      category: "unnecessary_clarification",
      pass: !t2.context.needsClarification,
    });
  }

  // --- Scenario C ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "Who is Jaime?",
      store,
      executePipeline: async () => ({ answer: "Jaime from Kendall." }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "c",
      message: "What did she ask about Sarah?",
      store,
      executePipeline: async () => ({ answer: "About Sarah." }),
    });
    checks.push({
      name: "C1 she → Jaime",
      category: "entity_resolution",
      pass: /Jaime/i.test(t2.context.resolvedMessage),
    });
  }

  // --- Scenario D ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "d",
      message: "Review the Kendall proposal.",
      store,
      executePipeline: async () => ({ answer: "Reviewed." }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "d",
      message: "Make it shorter.",
      store,
      executePipeline: async () => ({ answer: "Shorter draft." }),
    });
    checks.push({
      name: "D1 it → proposal",
      category: "contextual_follow_up",
      pass: /Kendall|proposal/i.test(t2.context.resolvedMessage),
    });
  }

  // --- Scenario E isolation ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "e1",
      message: "Review the Kendall proposal.",
      store,
      executePipeline: async () => ({ answer: "ok" }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "e2",
      message: "Tell me about Olney Chamber.",
      store,
      executePipeline: async (ctx) => ({
        answer: "ok",
      }),
    });
    const e2 = await store.load("u", "e2");
    checks.push({
      name: "E1 no Kendall leak into conv2",
      category: "conversation_isolation",
      pass: !e2!.active_entities.some((e) => /Kendall/i.test(e.name)),
    });
    checks.push({
      name: "E2 chamber present in conv2",
      category: "conversation_isolation",
      pass: e2!.active_entities.some((e) => /Chamber/i.test(e.name)),
    });
  }

  // --- Ambiguity: clarification is appropriate ---
  {
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
    const r = resolveReferences({
      message: "Did he respond?",
      activeEntities: entities,
    });
    checks.push({
      name: "Ambiguity asks clarification (not random)",
      category: "unnecessary_clarification",
      pass: r.ambiguous === true && Boolean(r.clarificationPrompt),
    });
  }

  // --- Fallback ---
  {
    const store = createMemoryStore();
    store.load = async () => {
      throw new Error("boom");
    };
    const t = await runGideonTurn({
      userId: "u",
      conversationId: "fb",
      message: "Hello",
      store,
      executePipeline: async () => ({ answer: "Hi" }),
    });
    checks.push({
      name: "Fallback still answers",
      category: "fallback_reliability",
      pass: t.fellBack === true && t.answer === "Hi",
    });
  }

  // --- Space continuity ---
  {
    const store = createMemoryStore();
    await runGideonTurn({
      userId: "u",
      conversationId: "space",
      message: "Find BPM 57598.",
      currentSpaceId: "federal-capture",
      store,
      executePipeline: async () => ({ answer: "Found." }),
    });
    const t2 = await runGideonTurn({
      userId: "u",
      conversationId: "space",
      message: "Are we qualified?",
      currentSpaceId: "federal-capture",
      store,
      executePipeline: async (ctx) => ({
        answer: "ok",
      }),
    });
    checks.push({
      name: "Space id retained in candidateSpaceIds",
      category: "retrieval_continuity",
      pass: t2.context.candidateSpaceIds.includes("federal-capture"),
    });
  }

  return checks;
}

describe("Conversation Runtime — smoothness benchmark", () => {
  it("achieves 90%+ across scenario metrics", async () => {
    const checks = await runChecks();
    const passed = checks.filter((c) => c.pass).length;
    const total = checks.length;
    const rate = passed / total;

    const byCategory = new Map<string, { pass: number; total: number }>();
    for (const c of checks) {
      const row = byCategory.get(c.category) ?? { pass: 0, total: 0 };
      row.total += 1;
      if (c.pass) row.pass += 1;
      byCategory.set(c.category, row);
    }

    console.info(
      JSON.stringify({
        event: "gideon_runtime_smoothness",
        passed,
        total,
        rate: Number(rate.toFixed(3)),
        categories: Object.fromEntries(byCategory),
        failures: checks.filter((c) => !c.pass).map((c) => c.name),
      })
    );

    assert.ok(
      rate >= 0.9,
      `Smoothness ${passed}/${total} (${(rate * 100).toFixed(1)}%) below 90%. Failures: ${checks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join(", ")}`
    );
  });
});
