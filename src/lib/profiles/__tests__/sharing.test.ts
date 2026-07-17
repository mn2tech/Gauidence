import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createInviteToken,
  hashInviteToken,
  isValidInviteEmail,
  normalizeInviteEmail,
} from "../invitations.ts";
import {
  canManageProfileAccess,
  canShareGuardianProfile,
  isProfileOwner,
  type GuardianProfile,
} from "../types.ts";

function sample(overrides: Partial<GuardianProfile> = {}): GuardianProfile {
  return {
    id: "p1",
    owner_user_id: "u1",
    profile_type: "business",
    display_name: "Acme",
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
    parent_profile_id: null,
    is_default: false,
    created_at: "",
    updated_at: "",
    access_role: "owner",
    ...overrides,
  };
}

describe("shared vault helpers", () => {
  it("normalizes and validates invite emails", () => {
    assert.equal(normalizeInviteEmail("  Ada@Example.COM "), "ada@example.com");
    assert.equal(isValidInviteEmail("ada@example.com"), true);
    assert.equal(isValidInviteEmail("not-an-email"), false);
  });

  it("hashes invite tokens consistently", () => {
    const token = createInviteToken();
    assert.ok(token.length >= 32);
    assert.equal(hashInviteToken(token), hashInviteToken(token));
    assert.notEqual(hashInviteToken(token), hashInviteToken(token + "x"));
  });

  it("limits sharing to business and client vaults for owners", () => {
    assert.equal(canShareGuardianProfile(sample()), true);
    assert.equal(
      canShareGuardianProfile(sample({ profile_type: "client" })),
      true
    );
    assert.equal(
      canShareGuardianProfile(sample({ profile_type: "personal" })),
      false
    );
    assert.equal(canManageProfileAccess(sample()), true);
    assert.equal(
      canManageProfileAccess(sample({ access_role: "editor" })),
      false
    );
    assert.equal(isProfileOwner(sample({ access_role: "editor" })), false);
  });
});
