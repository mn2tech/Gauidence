import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GuardianProfile } from "@/lib/profiles/types";
import { namesMatch, nameMatchScore } from "../normalize";
import { matchOrganizationTarget } from "../match";
import type { OrganizationAiOutput } from "../types";

function profile(
  partial: Partial<GuardianProfile> & { id: string; display_name: string }
): GuardianProfile {
  return {
    owner_user_id: "user-1",
    profile_type: "other",
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
    ...partial,
  };
}

function ai(partial: Partial<OrganizationAiOutput>): OrganizationAiOutput {
  return {
    title: "Test",
    document_type: "general",
    summary: "Summary",
    people: [],
    organizations: [],
    topics: [],
    dates: [],
    tags: [],
    suggested_profile_name: "",
    suggested_vault_name: "",
    confidence: 0.9,
    reason: "Test reason",
    suggested_questions: [],
    ...partial,
  };
}

describe("organization normalize", () => {
  it("matches synonyms books and reading", () => {
    assert.equal(namesMatch("Books", "Reading"), true);
    assert.ok(nameMatchScore("Books", "Reading") >= 0.5);
  });

  it("ignores punctuation and case", () => {
    assert.equal(namesMatch("Nolan", "nolan"), true);
    assert.equal(namesMatch("Personal.", "personal"), true);
  });
});

describe("matchOrganizationTarget", () => {
  const family = profile({
    id: "family-1",
    display_name: "Family",
    profile_type: "family",
  });
  const nolan = profile({
    id: "nolan-1",
    display_name: "Nolan",
    profile_type: "child",
    parent_profile_id: "family-1",
  });
  const reading = profile({
    id: "reading-1",
    display_name: "Reading",
    profile_type: "other",
    parent_profile_id: "family-1",
  });
  const books = profile({
    id: "books-1",
    display_name: "Books",
    profile_type: "other",
    parent_profile_id: "family-1",
  });
  const michael = profile({
    id: "michael-1",
    display_name: "Michael",
    profile_type: "personal",
  });
  const personal = profile({
    id: "personal-1",
    display_name: "Personal",
    profile_type: "other",
    parent_profile_id: "michael-1",
  });

  it("recommends existing Nolan and Reading without creating", () => {
    const result = matchOrganizationTarget(
      [family, nolan, reading],
      ai({
        suggested_profile_name: "Nolan",
        suggested_vault_name: "Reading",
        people: ["Nolan"],
      }),
      "family-1"
    );
    assert.equal(result.recommendedAction, "save_to_existing");
    assert.equal(result.suggestedVaultId, "reading-1");
  });

  it("suggests creating Reading when Nolan exists", () => {
    const result = matchOrganizationTarget(
      [family, nolan],
      ai({
        suggested_profile_name: "Nolan",
        suggested_vault_name: "Reading",
        people: ["Nolan"],
      }),
      "family-1"
    );
    assert.equal(result.recommendedAction, "create_vault");
    assert.equal(result.suggestedProfileId, "nolan-1");
  });

  it("suggests new profile and vault when Nolan missing", () => {
    const result = matchOrganizationTarget(
      [family],
      ai({
        suggested_profile_name: "Nolan",
        suggested_vault_name: "Reading",
      }),
      "family-1"
    );
    assert.equal(result.recommendedAction, "create_profile_and_vault");
  });

  it("prefers Books over creating Reading when semantic match is strong", () => {
    const result = matchOrganizationTarget(
      [family, nolan, books],
      ai({
        suggested_profile_name: "Nolan",
        suggested_vault_name: "Reading",
        topics: ["books", "reading"],
      }),
      "nolan-1"
    );
    assert.equal(result.recommendedAction, "save_to_existing");
    assert.equal(result.suggestedVaultId, "books-1");
  });

  it("sends low-confidence uploads to unorganized", () => {
    const result = matchOrganizationTarget(
      [family, nolan],
      ai({
        confidence: 0.2,
        suggested_profile_name: "Nolan",
        suggested_vault_name: "Reading",
      }),
      "family-1"
    );
    assert.equal(result.recommendedAction, "unorganized");
  });

  it("suggests identity vault for passport under personal profile", () => {
    const identity = profile({
      id: "identity-1",
      display_name: "Identity",
      profile_type: "other",
      parent_profile_id: "michael-1",
    });
    const result = matchOrganizationTarget(
      [michael, personal, identity],
      ai({
        document_type: "passport",
        suggested_profile_name: "Michael",
        suggested_vault_name: "Identity",
        people: ["Michael"],
      }),
      "michael-1"
    );
    assert.equal(result.recommendedAction, "save_to_existing");
    assert.equal(result.suggestedVaultId, "identity-1");
  });
});
