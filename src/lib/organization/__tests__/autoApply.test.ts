import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAutoApplyOrganizationMove } from "../autoApply";
import type { GuardianProfile } from "@/lib/profiles/types";

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

describe("canAutoApplyOrganizationMove", () => {
  const event = profile({
    id: "event-1",
    display_name: "Crossroadsconnect",
    profile_type: "event",
  });
  const unorganized = profile({
    id: "uno-1",
    display_name: "Unorganized",
    profile_type: "other",
    description: "guardian:unorganized",
  });

  it("does not auto-move files out of an Event Space", () => {
    assert.equal(
      canAutoApplyOrganizationMove({
        mode: "auto",
        recommendedAction: "save_to_existing",
        confidence: 0.95,
        threshold: 0.85,
        suggestedVaultId: "other-space",
        currentProfileId: "event-1",
        currentProfile: event,
      }),
      false
    );
  });

  it("allows auto-file from Unorganized staging", () => {
    assert.equal(
      canAutoApplyOrganizationMove({
        mode: "auto",
        recommendedAction: "save_to_existing",
        confidence: 0.95,
        threshold: 0.85,
        suggestedVaultId: "event-1",
        currentProfileId: "uno-1",
        currentProfile: unorganized,
      }),
      true
    );
  });

  it("allows no-op auto-apply when already in the suggested Space", () => {
    assert.equal(
      canAutoApplyOrganizationMove({
        mode: "auto",
        recommendedAction: "save_to_existing",
        confidence: 0.95,
        threshold: 0.85,
        suggestedVaultId: "event-1",
        currentProfileId: "event-1",
        currentProfile: event,
      }),
      true
    );
  });
});
