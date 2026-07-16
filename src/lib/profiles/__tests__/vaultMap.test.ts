import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVaultMapTree } from "../vaultMap.ts";
import type { GuardianProfile } from "../types.ts";

function sample(
  overrides: Partial<GuardianProfile> &
    Pick<GuardianProfile, "id" | "display_name" | "profile_type">
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
  it("anchors under account owner with family and business as sibling branches", () => {
    const familyId = "fam-1";
    const businessId = "biz-1";
    const tree = buildVaultMapTree(
      [
        sample({
          id: "personal",
          display_name: "Danny",
          profile_type: "personal",
        }),
        sample({
          id: businessId,
          display_name: "Acme Co",
          profile_type: "business",
        }),
        sample({
          id: familyId,
          display_name: "Our Family",
          profile_type: "family",
        }),
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
        sample({
          id: "home1",
          display_name: "My House",
          profile_type: "home",
          parent_profile_id: familyId,
        }),
        sample({
          id: "car1",
          display_name: "Highlander",
          profile_type: "vehicle",
          parent_profile_id: familyId,
        }),
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
        sample({
          id: "other1",
          display_name: "Celebrations",
          profile_type: "other",
          parent_profile_id: familyId,
        }),
      ],
      "Danny"
    );

    assert.ok(tree);
    assert.equal(tree.ownerLabel, "Danny");
    assert.equal(tree.personalProfile?.id, "personal");
    assert.equal(tree.branches.length, 2);
    // Family before Business; top-level other stays at root
    assert.deepEqual(
      tree.branches.map((b) => b.profile.profile_type),
      ["family", "business"]
    );

    const family = tree.branches[0];
    assert.ok(family);
    assert.equal(family.groups[0]?.label, "Family members");
    assert.deepEqual(
      family.groups[0]?.members.map((m) => m.display_name).sort(),
      ["Max", "Nolan"]
    );
    assert.equal(family.groups[1]?.label, "Things");
    assert.deepEqual(
      family.groups[1]?.members.map((m) => m.display_name).sort(),
      ["Highlander", "My House"]
    );
    assert.equal(family.groups[2]?.label, "Other");
    assert.deepEqual(
      family.groups[2]?.members.map((m) => m.display_name),
      ["Celebrations"]
    );

    const business = tree.branches[1];
    assert.ok(business);
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
