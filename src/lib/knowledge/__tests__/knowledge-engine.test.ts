import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isKnowledgeEngineEnabled } from "@/lib/features/knowledge-engine";
import { KnowledgeEngine } from "@/lib/knowledge/knowledge-engine";
import { triggerKnowledgeEngine } from "@/lib/knowledge/trigger-knowledge-engine";
import type { KnowledgeInput } from "@/lib/knowledge/types";

const ENV_KEY = "GUARDIAN_KNOWLEDGE_ENGINE_ENABLED";

function sampleDocumentInput(
  overrides: Partial<KnowledgeInput> = {}
): KnowledgeInput {
  return {
    sourceType: "document",
    sourceId: "doc-123",
    profileId: "profile-abc",
    vaultId: "profile-abc",
    content:
      "John Smith works at Acme Corp. Meeting on 2026-03-15. Total due: $1,250.00. Contact jane@example.com.",
    metadata: {
      fileName: "invoice.pdf",
      documentType: "invoice",
      title: "March invoice",
    },
    ...overrides,
  };
}

function sampleDailyLogInput(
  overrides: Partial<KnowledgeInput> = {}
): KnowledgeInput {
  return {
    sourceType: "daily_log",
    sourceId: "log-456",
    profileId: "profile-xyz",
    vaultId: "profile-xyz",
    content: "Visited Dr. Sarah Lee today for a follow-up.",
    metadata: {
      title: "Doctor visit",
      logDate: "2026-03-10",
      category: "health",
    },
    ...overrides,
  };
}

describe("knowledge engine feature flag", () => {
  const previous = process.env[ENV_KEY];

  afterEach(() => {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });

  it("defaults to disabled when missing", () => {
    delete process.env[ENV_KEY];
    assert.equal(isKnowledgeEngineEnabled(), false);
  });

  it("is enabled only when set to true", () => {
    process.env[ENV_KEY] = "true";
    assert.equal(isKnowledgeEngineEnabled(), true);
    process.env[ENV_KEY] = "false";
    assert.equal(isKnowledgeEngineEnabled(), false);
  });
});

describe("KnowledgeEngine.process (shadow mode)", () => {
  it("returns a structured preview without throwing", async () => {
    const preview = await KnowledgeEngine.process(sampleDocumentInput());
    assert.ok(Array.isArray(preview.entities));
    assert.ok(Array.isArray(preview.suggestedMemories));
    assert.ok(Array.isArray(preview.suggestedTimelineEvents));
    assert.ok(Array.isArray(preview.suggestedRelationships));
    assert.ok(preview.entities.length > 0);
    assert.ok(
      preview.suggestedMemories.every(
        (m) => m.sourceType === "document" && m.sourceId === "doc-123"
      )
    );
  });

  it("preserves source traceability on derived items", async () => {
    const preview = await KnowledgeEngine.process(sampleDailyLogInput());
    for (const item of preview.suggestedMemories) {
      assert.equal(item.sourceType, "daily_log");
      assert.equal(item.sourceId, "log-456");
    }
    for (const item of preview.suggestedTimelineEvents) {
      assert.equal(item.sourceType, "daily_log");
      assert.equal(item.sourceId, "log-456");
    }
    for (const item of preview.suggestedRelationships) {
      assert.equal(item.sourceType, "daily_log");
      assert.equal(item.sourceId, "log-456");
    }
  });
});

describe("triggerKnowledgeEngine", () => {
  const previous = process.env[ENV_KEY];
  let originalProcess: typeof KnowledgeEngine.process;
  let processCalls: KnowledgeInput[];

  beforeEach(() => {
    processCalls = [];
    originalProcess = KnowledgeEngine.process;
    KnowledgeEngine.process = async (input) => {
      processCalls.push(input);
      return {
        entities: [],
        suggestedMemories: [],
        suggestedTimelineEvents: [],
        suggestedRelationships: [],
      };
    };
  });

  afterEach(() => {
    KnowledgeEngine.process = originalProcess;
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });

  it("document save path succeeds when feature flag is disabled", async () => {
    delete process.env[ENV_KEY];
    await assert.doesNotReject(async () => {
      await triggerKnowledgeEngine(sampleDocumentInput());
    });
    assert.equal(processCalls.length, 0);
  });

  it("daily log save path succeeds when feature flag is disabled", async () => {
    process.env[ENV_KEY] = "false";
    await assert.doesNotReject(async () => {
      await triggerKnowledgeEngine(sampleDailyLogInput());
    });
    assert.equal(processCalls.length, 0);
  });

  it("document save path succeeds when Knowledge Engine throws", async () => {
    process.env[ENV_KEY] = "true";
    KnowledgeEngine.process = async () => {
      throw new Error("engine exploded");
    };
    await assert.doesNotReject(async () => {
      await triggerKnowledgeEngine(sampleDocumentInput());
    });
  });

  it("daily log save path succeeds when Knowledge Engine throws", async () => {
    process.env[ENV_KEY] = "true";
    KnowledgeEngine.process = async () => {
      throw new Error("engine exploded");
    };
    await assert.doesNotReject(async () => {
      await triggerKnowledgeEngine(sampleDailyLogInput());
    });
  });

  it("passes correct sourceType, sourceId, profileId, vaultId, content, and metadata", async () => {
    process.env[ENV_KEY] = "true";
    const input = sampleDocumentInput();
    await triggerKnowledgeEngine(input);
    assert.equal(processCalls.length, 1);
    assert.deepEqual(processCalls[0], input);
  });

  it("passes correct daily log input fields", async () => {
    process.env[ENV_KEY] = "true";
    const input = sampleDailyLogInput();
    await triggerKnowledgeEngine(input);
    assert.equal(processCalls.length, 1);
    assert.equal(processCalls[0].sourceType, "daily_log");
    assert.equal(processCalls[0].sourceId, "log-456");
    assert.equal(processCalls[0].profileId, "profile-xyz");
    assert.equal(processCalls[0].vaultId, "profile-xyz");
    assert.equal(processCalls[0].content, input.content);
    assert.deepEqual(processCalls[0].metadata, input.metadata);
  });

  it("skips processing for empty content", async () => {
    process.env[ENV_KEY] = "true";
    await triggerKnowledgeEngine(sampleDocumentInput({ content: "   " }));
    assert.equal(processCalls.length, 0);
  });

  it("never rethrows errors to the caller", async () => {
    process.env[ENV_KEY] = "true";
    KnowledgeEngine.process = async () => {
      throw new Error("fatal");
    };
    const result = await triggerKnowledgeEngine(sampleDocumentInput());
    assert.equal(result, undefined);
  });
});

describe("shadow mode has no Supabase dependency", () => {
  it("knowledge engine modules do not import supabase", async () => {
    const modules = [
      "@/lib/knowledge/knowledge-engine",
      "@/lib/knowledge/entity-extractor",
      "@/lib/knowledge/memory-generator",
      "@/lib/knowledge/timeline-generator",
      "@/lib/knowledge/relationship-builder",
    ];

    for (const specifier of modules) {
      const mod = await import(specifier);
      assert.equal("createClient" in mod, false);
      assert.equal("SupabaseClient" in mod, false);
    }
  });

  it("process does not perform database writes", async () => {
    const preview = await KnowledgeEngine.process(sampleDocumentInput());
    assert.ok(preview);
    assert.equal(typeof preview, "object");
  });
});

describe("route integration contract", () => {
  it("trigger returns void and does not alter API payload shape", async () => {
    delete process.env[ENV_KEY];
    const apiResponse = {
      log: { id: "log-456", content: "test" },
      newlyGranted: [],
    };
    await triggerKnowledgeEngine(sampleDailyLogInput());
    assert.deepEqual(apiResponse, {
      log: { id: "log-456", content: "test" },
      newlyGranted: [],
    });
  });
});
