import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_CREATE_OPTIONS,
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedVehicles,
  canAttachChildToParent,
  clientsOf,
  employeesOf,
  familyMembersOf,
  formatLinkedClientsForGideon,
  formatLinkedEmployeesForGideon,
  formatLinkedFamilyForGideon,
  formatLinkedVehiclesForGideon,
  isLinkedMemberProfile,
  profileCompanyContext,
  profileSubtitle,
  topLevelProfiles,
  vaultLabel,
  vehiclesOf,
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
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "family"));
    assert.ok(PROFILE_CREATE_OPTIONS.some((o) => o.profileType === "vehicles"));
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

  it("links employees and clients under org profiles", () => {
    assert.equal(canHaveLinkedEmployees("business"), true);
    assert.equal(canHaveLinkedClients("non_profit"), true);
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
        id: "c1",
        profile_type: "client",
        display_name: "Northside Clinic",
        parent_profile_id: parentId,
        description: "Retainer",
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

    const linkedClients = clientsOf(list, parentId);
    assert.equal(linkedClients.length, 1);
    assert.equal(linkedClients[0]?.display_name, "Northside Clinic");

    const roster = formatLinkedEmployeesForGideon("Acme", [
      { display_name: "Jordan", job_title: "Ops", department: null },
    ]);
    assert.match(roster, /Linked employee profiles in Guardian: 1/);
    assert.match(roster, /Jordan/);
    assert.match(
      formatLinkedEmployeesForGideon("Acme", []),
      /Linked employee profiles in Guardian: 0/
    );
    assert.match(
      formatLinkedClientsForGideon("Acme", [
        {
          display_name: "Northside Clinic",
          job_title: null,
          department: null,
          description: "Retainer",
        },
      ]),
      /Linked client profiles in Guardian: 1/
    );

    assert.equal(isLinkedMemberProfile(list[1]!), true);
    assert.equal(isLinkedMemberProfile(list[2]!), true);
    assert.equal(isLinkedMemberProfile(list[3]!), false);
    assert.equal(isLinkedMemberProfile(list[0]!), false);

    const top = topLevelProfiles(list);
    assert.equal(top.length, 2);
    assert.deepEqual(
      top.map((p) => p.id).sort(),
      [parentId, "e2"].sort()
    );
  });

  it("links family members and vehicles under container profiles", () => {
    assert.equal(canHaveLinkedFamilyMembers("family"), true);
    assert.equal(canHaveLinkedVehicles("vehicles"), true);
    assert.equal(canHaveLinkedFamilyMembers("personal"), false);

    const familyId = "fam1";
    const fleetId = "veh1";
    const list = [
      sample({ id: familyId, profile_type: "family", display_name: "Our Family" }),
      sample({
        id: "kid1",
        profile_type: "child",
        display_name: "Maya",
        parent_profile_id: familyId,
        relationship: "Child",
      }),
      sample({
        id: "spouse1",
        profile_type: "spouse_partner",
        display_name: "Sam",
        parent_profile_id: familyId,
      }),
      sample({
        id: "standalone-child",
        profile_type: "child",
        display_name: "Unlinked",
        parent_profile_id: null,
      }),
      sample({ id: fleetId, profile_type: "vehicles", display_name: "Garage" }),
      sample({
        id: "car1",
        profile_type: "vehicle",
        display_name: "2019 Civic",
        parent_profile_id: fleetId,
      }),
    ];

    const members = familyMembersOf(list, familyId);
    assert.equal(members.length, 2);
    assert.equal(vehiclesOf(list, fleetId).length, 1);
    assert.equal(isLinkedMemberProfile(list[1]!), true);
    assert.equal(isLinkedMemberProfile(list[5]!), true);
    assert.equal(isLinkedMemberProfile(list[3]!), false);

    const top = topLevelProfiles(list);
    assert.deepEqual(
      top.map((p) => p.id).sort(),
      [familyId, fleetId, "standalone-child"].sort()
    );

    assert.match(
      formatLinkedFamilyForGideon("Our Family", [
        {
          display_name: "Maya",
          profile_type: "child",
          relationship: "Child",
        },
      ]),
      /Linked family member profiles in Guardian: 1/
    );
    assert.match(
      formatLinkedVehiclesForGideon("Garage", [
        { display_name: "2019 Civic", description: null },
      ]),
      /Linked vehicle profiles in Guardian: 1/
    );

    assert.equal(canAttachChildToParent("child", "family"), true);
    assert.equal(canAttachChildToParent("spouse_partner", "family"), true);
    assert.equal(canAttachChildToParent("vehicle", "vehicles"), true);
    assert.equal(canAttachChildToParent("child", "vehicles"), false);
    assert.equal(canAttachChildToParent("employee", "business"), true);
    assert.equal(canAttachChildToParent("home", "family"), true);
    assert.equal(canAttachChildToParent("home", "business"), true);
    assert.equal(canAttachChildToParent("home", "non_profit"), true);
    assert.equal(canAttachChildToParent("home", "vehicles"), false);
  });
});
