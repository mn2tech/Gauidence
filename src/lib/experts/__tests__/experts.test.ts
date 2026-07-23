import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { clearExpertCache, getExpertById, getExpertCatalog, getExpertPublicById } from "@/lib/experts/load-expert";
import { searchExpertKnowledge } from "@/lib/experts/search-expert-knowledge";
import { buildExpertPrompt } from "@/lib/experts/build-expert-prompt";
import { validateExpertsCatalog } from "@/lib/experts/validate-expert";
import { isExpertInstallable } from "@/lib/experts/expert-types";
import { canAccessGuardianExperts } from "@/lib/features/experts";

describe("expert loader", () => {
  beforeEach(() => {
    clearExpertCache();
  });

  it("loads valid example expert JSON", () => {
    const expert = getExpertById("example-expert");
    assert.ok(expert);
    assert.equal(expert?.name, "Example Expert");
    assert.equal(expert?.roadmap.length, 2);
    assert.equal(expert?.knowledgeTopics.length, 3);
  });

  it("does not expose systemPrompt in public expert view", () => {
    const expert = getExpertPublicById("example-expert");
    assert.ok(expert);
    assert.equal("systemPrompt" in expert, false);
  });

  it("keeps invalid experts from crashing the catalog", () => {
    const catalog = getExpertCatalog();
    assert.ok(catalog.length >= 1);
    assert.ok(catalog.every((item) => item.id));
  });
});

describe("expert validation", () => {
  it("validates the shipped catalog and expert files", () => {
    const issues = validateExpertsCatalog();
    assert.deepEqual(issues, []);
  });
});

describe("expert knowledge search", () => {
  beforeEach(() => clearExpertCache());

  it("returns relevant topics for a query", () => {
    const results = searchExpertKnowledge({
      expertId: "example-expert",
      query: "installation profile",
      limit: 3,
    });
    assert.ok(results.length > 0);
    assert.ok(results[0].score > 0);
    assert.ok(/installation|capabilities|assessment/.test(results[0].title.toLowerCase()));
  });
});

describe("expert prompt builder", () => {
  beforeEach(() => clearExpertCache());

  it("builds server-side prompt without client overrides", () => {
    const expert = getExpertById("example-expert");
    assert.ok(expert);
    const prompt = buildExpertPrompt({
      expert: expert!,
      question: "How do installations work?",
      knowledge: searchExpertKnowledge({
        expertId: expert!.id,
        query: "installation",
        limit: 2,
      }),
    });
    assert.ok(prompt.system.includes("Guardian"));
    assert.ok(prompt.system.includes(expert!.systemPrompt));
    assert.equal(prompt.messages.at(-1)?.content, "How do installations work?");
  });
});

describe("expert installation rules", () => {
  it("allows installation for active, beta, and development experts", () => {
    assert.equal(isExpertInstallable("active"), true);
    assert.equal(isExpertInstallable("beta"), true);
    assert.equal(isExpertInstallable("development"), true);
    assert.equal(isExpertInstallable("coming-soon"), false);
  });
});

describe("guardian experts feature flag", () => {
  const original = process.env.GUARDIAN_EXPERTS_FLAG;

  afterEach(() => {
    process.env.GUARDIAN_EXPERTS_FLAG = original;
  });

  it("defaults to disabled", () => {
    delete process.env.GUARDIAN_EXPERTS_FLAG;
    assert.equal(canAccessGuardianExperts({ email: "user@example.com" }), false);
  });

  it("allows access when enabled", () => {
    process.env.GUARDIAN_EXPERTS_FLAG = "enabled";
    assert.equal(canAccessGuardianExperts({ email: "user@example.com" }), true);
  });
});
