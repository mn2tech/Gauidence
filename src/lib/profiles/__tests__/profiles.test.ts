import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_CREATE_OPTIONS,
  canHaveLinkedEmployees,
  employeesOf,
  profileCompanyContext,
  profileSubtitle,
  vaultLabel,
  type GuardianProfile,
} from "../types.ts";
import { buildGideonSuggestions } from "../../vault/gideon.ts";

function sample(
  overrides: Partial<GuardianProfile> = {}
): GuardianProfile {
  return {
    id: "p1",
    owner_user_id: "u1",
    profile_type: "personal",
    display_name: "Michael",
    relationship: "Myself",
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
    is_default: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("guardian profiles helpers", () => {
  it("exposes create options for all intended audiences", () => {
    assert.ok(PROFILE_CREATE_OPTIONS.length >= 10);
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "business"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "non_profit"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "vehicle"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "home"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "pet"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "child"));
  });

  it("uses business legal/display name for company context", () => {
    assert.equal(
      profileCompanyContext(
        sample({
          profile_type: "business",
          display_name: "NM2TECH LLC",
          business_legal_name: "NM2TECH Limited Liability Company",
        })
      ),
      "NM2TECH Limited Liability Company"
    );
  });

  it("labels vaults clearly", () => {
    assert.match(vaultLabel(sample()), /Michael/);
    assert.equal(
      vaultLabel(
        sample({ profile_type: "business", display_name: "NM2TECH LLC" })
      ),
      "NM2TECH LLC Vault"
    );
    assert.equal(
      vaultLabel(
        sample({ profile_type: "vehicle", display_name: "2019 Civic" })
      ),
      "2019 Civic Vault"
    );
    assert.equal(
      vaultLabel(sample({ profile_type: "home", display_name: "Oak Street" })),
      "Oak Street Vault"
    );
    assert.equal(
      vaultLabel(sample({ profile_type: "pet", display_name: "Buddy" })),
      "Buddy Vault"
    );
  });

  it("does not duplicate Child · Child in subtitle", () => {
    assert.equal(
      profileSubtitle({
        profile_type: "child",
        relationship: "Child",
      }),
      "Child"
    );
    assert.equal(
      profileSubtitle({
        profile_type: "personal",
        relationship: "Myself",
      }),
      "Personal · Myself"
    );
  });

  it("adapts Gideon suggestions to profile kind", () => {
    const docs = [{ documentType: "invoice", guardianStatus: "upcoming" }];
    const biz = buildGideonSuggestions(docs, "business");
    assert.ok(biz.some((q) => /invoice|receive/i.test(q)));

    const child = buildGideonSuggestions(
      [{ documentType: "other", fileName: "iep.pdf" }],
      "child"
    );
    assert.ok(child.some((q) => /school/i.test(q)));
    assert.ok(!child.some((q) => /expecting to receive/i.test(q)));
  });

  it("links employees under org profiles", () => {
    assert.equal(canHaveLinkedEmployees("business"), true);
    assert.equal(canHaveLinkedEmployees("non_profit"), true);
    assert.equal(canHaveLinkedEmployees("personal"), false);

    const parentId = "biz1";
    const list = [
      sample({ id: parentId, profile_type: "business", display_name: "Acme" }),
      sample({
        id: "e1",
        profile_type: "employee",
        display_name: "Jordan",
        parent_profile_id: parentId,
      }),
      sample({
        id: "e2",
        profile_type: "employee",
        display_name: "Sam",
        parent_profile_id: null,
      }),
    ];
    const linked = employeesOf(list, parentId);
    assert.equal(linked.length, 1);
    assert.equal(linked[0]?.display_name, "Jordan");
  });
});
