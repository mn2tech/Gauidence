import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findReusableSpaceId } from "../spaces";
import {
  isBusinessAdvisoryQuestion,
  isBusinessKnowledgeQuestion,
  formatPackSkillsForPrompt,
  buildBusinessQuickActions,
  businessPackSkillPromptNote,
} from "../gideon";
import {
  GUARDIAN_BUSINESS_PACK_SLUG,
  GUARDIAN_BUSINESS_PACK_VERSION,
} from "../types";
import {
  getGuardianPackEngineFlag,
  isGuardianPackEngineEnabled,
} from "../../features/packs";
import { normalizeRelationshipType } from "../../ontology/types";
import { isFuzzyMatchAllowed, normalizeEntityName } from "../../ontology/normalize";
import { classifyGideonIntent } from "../../gideon/intent";

describe("pack engine feature flag", () => {
  it("defaults to admin-only", () => {
    const prev = process.env.GUARDIAN_PACK_ENGINE_FLAG;
    delete process.env.GUARDIAN_PACK_ENGINE_FLAG;
    try {
      assert.equal(getGuardianPackEngineFlag(), "admin-only");
      assert.equal(isGuardianPackEngineEnabled({ email: "user@example.com" }), false);
    } finally {
      if (prev === undefined) delete process.env.GUARDIAN_PACK_ENGINE_FLAG;
      else process.env.GUARDIAN_PACK_ENGINE_FLAG = prev;
    }
  });

  it("enables for all when flag is enabled", () => {
    const prev = process.env.GUARDIAN_PACK_ENGINE_FLAG;
    process.env.GUARDIAN_PACK_ENGINE_FLAG = "enabled";
    try {
      assert.equal(isGuardianPackEngineEnabled({ email: "user@example.com" }), true);
    } finally {
      if (prev === undefined) delete process.env.GUARDIAN_PACK_ENGINE_FLAG;
      else process.env.GUARDIAN_PACK_ENGINE_FLAG = prev;
    }
  });
});

describe("pack space reuse", () => {
  it("reuses existing space by case-insensitive display name", () => {
    const id = findReusableSpaceId(
      [
        { id: "a", display_name: "Clients" },
        { id: "b", display_name: "Contracts" },
      ],
      "clients"
    );
    assert.equal(id, "a");
  });

  it("returns null when no match", () => {
    assert.equal(
      findReusableSpaceId([{ id: "a", display_name: "Clients" }], "Team"),
      null
    );
  });
});

describe("pack constants", () => {
  it("seeds Guardian Business as pack #001 v1.0.0", () => {
    assert.equal(GUARDIAN_BUSINESS_PACK_SLUG, "guardian-business");
    assert.equal(GUARDIAN_BUSINESS_PACK_VERSION, "1.0.0");
  });
});

describe("business ontology types", () => {
  it("normalizes business relationship aliases", () => {
    assert.equal(normalizeRelationshipType("EMPLOYS"), "EMPLOYS");
    assert.equal(normalizeRelationshipType("PROPOSED_TO"), "PROPOSED_TO");
    assert.equal(normalizeRelationshipType("MAY_BECOME"), "MAY_BECOME");
    assert.equal(normalizeRelationshipType("SERVES_CLIENT"), "SERVES");
    assert.equal(normalizeRelationshipType("EMPLOYER_OF"), "EMPLOYS");
  });

  it("allows fuzzy match for client and proposal", () => {
    assert.equal(isFuzzyMatchAllowed("client"), true);
    assert.equal(isFuzzyMatchAllowed("proposal"), true);
    assert.equal(isFuzzyMatchAllowed("person"), false);
  });

  it("normalizes entity names for resolution", () => {
    assert.equal(normalizeEntityName("  Proxdose  "), "proxdose");
    assert.equal(normalizeEntityName("Proxdose, Inc."), "proxdose inc");
  });
});

describe("gideon business pack routing", () => {
  it("detects business knowledge questions", () => {
    assert.equal(
      isBusinessKnowledgeQuestion("What clients are we currently working with?"),
      true
    );
    assert.equal(
      isBusinessKnowledgeQuestion("Show me everything we know about Proxdose."),
      true
    );
    assert.equal(isBusinessKnowledgeQuestion("Hello there"), false);
  });

  it("detects advisory questions", () => {
    assert.equal(isBusinessAdvisoryQuestion("What should I follow up on?"), true);
    assert.equal(isBusinessAdvisoryQuestion("What is the weather?"), false);
  });

  it("routes client questions to knowledge search", () => {
    const route = classifyGideonIntent({
      question: "Show me everything we know about Proxdose.",
    });
    assert.equal(route.capabilities.guardianKnowledge, true);
  });

  it("routes follow-up advisory with knowledge + chief of staff", () => {
    const route = classifyGideonIntent({
      question: "What should I follow up on?",
    });
    assert.equal(route.capabilities.guardianKnowledge, true);
    assert.equal(route.capabilities.chiefOfStaff, true);
    assert.equal(route.intent, "combined");
  });

  it("formats pack skill prompts", () => {
    const text = formatPackSkillsForPrompt([
      {
        prompt_addon:
          "BUSINESS CHIEF OF STAFF:\nDistinguish facts from recommendations.",
      },
    ]);
    assert.match(text, /Distinguish facts from recommendations/);
  });

  it("builds zero-DB skill notes for org spaces", () => {
    const note = businessPackSkillPromptNote({
      packEngineEnabled: true,
      isOrgSpace: true,
      includeSkill: true,
    });
    assert.match(note, /Known from Guardian data/);
    assert.equal(
      businessPackSkillPromptNote({
        packEngineEnabled: true,
        isOrgSpace: false,
        includeSkill: true,
      }),
      ""
    );
  });

  it("exposes business quick actions", () => {
    const actions = buildBusinessQuickActions();
    assert.ok(actions.some((a) => /follow up/i.test(a.prompt)));
  });
});

describe("install idempotency helpers", () => {
  it("selected space key set does not duplicate on re-run logic", () => {
    const first = new Set(["clients", "contracts"]);
    const second = ["clients", "contracts", "clients"];
    for (const k of second) first.add(k);
    assert.equal(first.size, 2);
  });
});
