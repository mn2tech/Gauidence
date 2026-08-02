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

  it("defaults search to chat home profile", () => {
    const meta = resolveWorkspaceScopes({
      accessibleProfiles: accessible,
      activeProfile: accessible[0]!,
      chatHomeProfileId: "p1",
    });
    assert.equal(meta.activeProfile.id, "p1");
    assert.ok(meta.searchProfileIds.length >= 1);
    assert.match(meta.chatContextLabel, /NM2TECH/);
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
