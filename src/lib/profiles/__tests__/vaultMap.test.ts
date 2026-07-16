import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVaultMapRoots } from "../vaultMap.ts";
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

describe("vault map roots", () => {
  it("groups children under top-level containers", () => {
    const familyId = "fam-1";
    const roots = buildVaultMapRoots([
      sample({ id: familyId, display_name: "Our Family", profile_type: "family" }),
      sample({
        id: "c1",
        display_name: "Nolan",
        profile_type: "child",
        parent_profile_id: familyId,
      }),
      sample({
        id: "c2",
        display_name: "Matthew",
        profile_type: "child",
        parent_profile_id: familyId,
      }),
      sample({ id: "solo", display_name: "Side project", profile_type: "other" }),
    ]);

    assert.equal(roots.length, 2);
    const family = roots.find((r) => r.profile.id === familyId);
    assert.ok(family);
    assert.equal(family.children.length, 2);
    assert.deepEqual(
      family.children.map((c) => c.display_name).sort(),
      ["Matthew", "Nolan"]
    );
    const solo = roots.find((r) => r.profile.id === "solo");
    assert.ok(solo);
    assert.equal(solo.children.length, 0);
  });
});
