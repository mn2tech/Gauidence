import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createInviteToken,
  hashInviteToken,
  isValidInviteEmail,
  normalizeInviteEmail,
} from "../invitations.ts";
import {
  canEditGuardianProfile,
  canManageProfileAccess,
  canShareGuardianProfile,
  collaboratorRoleLabel,
  isProfileOwner,
  isSharedGuardianProfile,
  parseCollaboratorInviteRole,
  SHAREABLE_PROFILE_TYPES,
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
    location_address: null,
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

  it("allows sharing on family and client leaf vaults", () => {
    for (const profileType of SHAREABLE_PROFILE_TYPES) {
      assert.equal(
        canShareGuardianProfile(sample({ profile_type: profileType })),
        true,
        profileType
      );
      assert.equal(
        canManageProfileAccess(sample({ profile_type: profileType })),
        true,
        profileType
      );
    }
  });

  it("blocks sharing on containers and private vault types", () => {
    const blocked = [
      "personal",
      "business",
      "family",
      "vehicles",
      "hobby",
      "spouse_partner",
    ] as const;
    for (const profileType of blocked) {
      assert.equal(
        canShareGuardianProfile(sample({ profile_type: profileType })),
        false,
        profileType
      );
    }
    assert.equal(canManageProfileAccess(sample()), false);
    assert.equal(
      canShareGuardianProfile(sample({ profile_type: "personal" })),
      false
    );
    assert.equal(canManageProfileAccess(sample({ access_role: "editor" })), false);
    assert.equal(isProfileOwner(sample({ access_role: "editor" })), false);
    assert.equal(canEditGuardianProfile(sample({ access_role: "editor" })), true);
    assert.equal(canEditGuardianProfile(sample({ access_role: "viewer" })), false);
    assert.equal(isSharedGuardianProfile(sample({ access_role: "viewer" })), true);
    assert.equal(collaboratorRoleLabel("viewer"), "Viewer");
    assert.equal(parseCollaboratorInviteRole("viewer"), "viewer");
    assert.equal(parseCollaboratorInviteRole("editor"), "editor");
    assert.equal(parseCollaboratorInviteRole("invalid"), "editor");
  });
});
