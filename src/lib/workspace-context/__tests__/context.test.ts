import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestionKindFrom } from "../suggestionKind.ts";
import { resolveWorkspaceScopes } from "../scopes.ts";
import type { GuardianProfile } from "@/lib/profiles/types";

function profile(
  overrides: Partial<GuardianProfile> &
    Pick<GuardianProfile, "id" | "display_name" | "profile_type">
): GuardianProfile {
  return {
    owner_user_id: "u1",
    parent_profile_id: null,
    relationship: null,
    avatar_url: null,
    date_of_birth: null,
    school_name: null,
    grade_level: null,
    business_legal_name: null,
    industry: null,
    website: null,
    description: null,
    job_title: null,
    department: null,
    organization_name: null,
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("suggestionKindFrom", () => {
  it("maps business to business", () => {
    assert.equal(suggestionKindFrom("business"), "business");
  });

  it("maps family_member to family", () => {
    assert.equal(suggestionKindFrom("family_member"), "family");
  });
});

describe("resolveWorkspaceScopes", () => {
  const accessible: GuardianProfile[] = [
    profile({ id: "p1", display_name: "NM2TECH", profile_type: "business" }),
    profile({
      id: "p2",
      display_name: "Payroll",
      profile_type: "employee",
      parent_profile_id: "p1",
    }),
  ];

  it("defaults search to chat home profile in workspace scope", () => {
    const meta = resolveWorkspaceScopes({
      accessibleProfiles: accessible,
      activeProfile: accessible[0]!,
      chatHomeProfileId: "p1",
      searchScope: "workspace",
    });
    assert.equal(meta.activeProfile.id, "p1");
    assert.deepEqual(meta.searchProfileIds, ["p1"]);
    assert.match(meta.chatContextLabel, /NM2TECH/);
  });

  it("searches every vault in global scope", () => {
    const meta = resolveWorkspaceScopes({
      accessibleProfiles: accessible,
      activeProfile: accessible[0]!,
      chatHomeProfileId: "p1",
      searchScope: "global",
    });
    assert.equal(meta.searchProfileIds.length, accessible.length);
  });

  it("narrows scope when chat is scoped to a child vault", () => {
    const meta = resolveWorkspaceScopes({
      accessibleProfiles: accessible,
      activeProfile: accessible[0]!,
      chatHomeProfileId: "p1",
      chatScopedProfileId: "p2",
    });
    assert.equal(meta.scopedProfile?.id, "p2");
    assert.equal(meta.searchProfileIds.length, 2);
    assert.ok(meta.searchProfileIds.includes("p1"));
    assert.ok(meta.searchProfileIds.includes("p2"));
  });
});

describe("buildGideonSystemPrompt", () => {
  it("omits retrieval blocks when Guardian knowledge was not loaded", async () => {
    const { buildGideonSystemPrompt } = await import("../formatSystemPrompt.ts");
    const { GIDEON_LOAD_NONE } = await import("@/lib/gideon/capabilities");
    const system = buildGideonSystemPrompt({
      activeProfile: {
        id: "p1",
        display_name: "NM2TECH",
        profile_type: "business",
        parent_profile_id: null,
      },
      retrievalScopes: [{ id: "p1", display_name: "NM2TECH", profile_type: "business" }],
      accessibleProfiles: [],
      profileNames: { p1: "NM2TECH" },
      searchProfileIds: ["p1"],
      chatHomeProfileId: "p1",
      chatScopedProfileId: null,
      searchScope: "workspace",
      scopedProfile: null,
      profileKind: "business",
      chatContextLabel: "label",
      vaultScopeNote: "note",
      blocks: {
        excerpts: "(none)",
        fileInventory: "(none)",
        attachedDocument: "(none)",
        dailyLogs: "(none)",
        clientRequests: "(none)",
        proposals: "(none)",
        schedule: "(none)",
        linkedProfiles: "(none)",
        vaultMap: "(none)",
        workMemory: "(none — user has no active work projects)",
        structuredKnowledge: "(none)",
        ontology: "(none)",
        businessIntelligence: "(none)",
      },
      promptOptions: {
        timeZone: "America/New_York",
        showPictures: false,
        reminderAgent: false,
        dailyLogCaptureAgent: false,
        workMemoryUpdateAgent: false,
        clientRequestReplyAgent: false,
        clientRequestCreateAgent: false,
        spaceCreateAgent: false,
        transcriptionMode: false,
        hasAttachedDocument: false,
        allVaultsNote: "Search this space",
        vaultEmptyNote: "No document excerpts matched",
        focusedWorkMemory: false,
        agentMode: false,
        fullLogQuote: false,
        intent: "conversation",
        loaded: GIDEON_LOAD_NONE,
        calendarNote: "",
        focusBlockNote: "",
        confirmationRequired: false,
      },
    });
    assert.doesNotMatch(system, /--- RETRIEVED EXCERPTS ---/);
    assert.doesNotMatch(system, /No document excerpts matched/);
    assert.match(system, /No Guardian document search ran/);
    assert.match(system, /CONVERSATION CONTEXT/);
  });

  it("requires Space sources when Guardian knowledge was loaded", async () => {
    const { buildGideonSystemPrompt } = await import("../formatSystemPrompt.ts");
    const { GIDEON_LOAD_FULL } = await import("@/lib/gideon/capabilities");
    const system = buildGideonSystemPrompt({
      activeProfile: {
        id: "p1",
        display_name: "NM2TECH",
        profile_type: "business",
        parent_profile_id: null,
      },
      retrievalScopes: [{ id: "p1", display_name: "NM2TECH", profile_type: "business" }],
      accessibleProfiles: [],
      profileNames: { p1: "NM2TECH" },
      searchProfileIds: ["p1"],
      chatHomeProfileId: "p1",
      chatScopedProfileId: null,
      searchScope: "workspace",
      scopedProfile: null,
      profileKind: "business",
      chatContextLabel: "label",
      vaultScopeNote: "note",
      blocks: {
        excerpts: "Fact from roster.pdf",
        fileInventory: "roster.pdf",
        attachedDocument: "(none)",
        dailyLogs: "(none)",
        clientRequests: "(none)",
        proposals: "(none)",
        schedule: "(none)",
        linkedProfiles: "(none)",
        vaultMap: "(none)",
        workMemory: "(none — user has no active work projects)",
        structuredKnowledge: "(none)",
        ontology: "(none)",
        businessIntelligence: "(none)",
      },
      promptOptions: {
        timeZone: "America/New_York",
        showPictures: false,
        reminderAgent: false,
        dailyLogCaptureAgent: false,
        workMemoryUpdateAgent: false,
        clientRequestReplyAgent: false,
        clientRequestCreateAgent: false,
        spaceCreateAgent: false,
        transcriptionMode: false,
        hasAttachedDocument: false,
        allVaultsNote: "Search this space",
        vaultEmptyNote: "No document excerpts matched",
        focusedWorkMemory: false,
        agentMode: false,
        fullLogQuote: false,
        intent: "knowledge_search",
        loaded: GIDEON_LOAD_FULL,
        calendarNote: "",
        focusBlockNote: "",
        confirmationRequired: false,
      },
    });
    assert.match(system, /SPACE SOURCE MODE/);
    assert.match(system, /Answer ONLY from the retrieval blocks/);
    assert.doesNotMatch(system, /No Guardian document search ran/);
  });
});

