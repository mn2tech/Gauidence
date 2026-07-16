import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVaultMapTree } from "../vaultMap.ts";
import type { GuardianProfile } from "../types.ts";

function sample(
  overrides: Partial<GuardianProfile> & Pick<GuardianProfile, "id" | "display_name" | "profile_type">
): GuardianProfile {
  return {
    owner_user_id: "u1",
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
    ...overrides,
  };
}

describe("vault map tree", () => {
  it("anchors under account owner with family members flat and business grouped", () => {
    const familyId = "fam-1";
    const businessId = "biz-1";
    const tree = buildVaultMapTree(
      [
        sample({
          id: "personal",
          display_name: "Danny",
          profile_type: "personal",
        }),
        sample({ id: familyId, display_name: "Our Family", profile_type: "family" }),
        sample({
          id: "c1",
          display_name: "Nolan",
          profile_type: "child",
          parent_profile_id: familyId,
        }),
        sample({
          id: "pet1",
          display_name: "Max",
          profile_type: "pet",
          parent_profile_id: familyId,
        }),
        sample({ id: businessId, display_name: "Acme Co", profile_type: "business" }),
        sample({
          id: "e1",
          display_name: "Alex",
          profile_type: "employee",
          parent_profile_id: businessId,
        }),
        sample({
          id: "cl1",
          display_name: "Big Client",
          profile_type: "client",
          parent_profile_id: businessId,
        }),
      ],
      "Danny"
    );

    assert.ok(tree);
    assert.equal(tree.ownerLabel, "Danny");
    assert.equal(tree.personalProfile?.id, "personal");
    assert.equal(tree.branches.length, 2);

    const family = tree.branches.find((b) => b.profile.id === familyId);
    assert.ok(family);
    assert.equal(family.groups.length, 0);
    assert.deepEqual(
      family.members.map((m) => m.display_name).sort(),
      ["Max", "Nolan"]
    );

    const business = tree.branches.find((b) => b.profile.id === businessId);
    assert.ok(business);
    assert.equal(business.members.length, 0);
    assert.equal(business.groups.length, 2);
    assert.equal(business.groups[0]?.label, "Employees");
    assert.deepEqual(
      business.groups[0]?.members.map((m) => m.display_name),
      ["Alex"]
    );
    assert.equal(business.groups[1]?.label, "Clients");
    assert.deepEqual(
      business.groups[1]?.members.map((m) => m.display_name),
      ["Big Client"]
    );
  });

  it("returns null when there are no profiles", () => {
    assert.equal(buildVaultMapTree([], "Danny"), null);
  });
});
