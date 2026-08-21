import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeNeedsOnboarding,
  isOnboardingIntent,
  isSchoolIntent,
  suggestionKindForIntent,
  vaultActionForIntent,
  uploadCtaForProfileKind,
  autoQuestionForUpload,
} from "../intent.ts";

describe("onboarding intent", () => {
  it("validates intent and school intent", () => {
    assert.equal(isOnboardingIntent("personal"), true);
    assert.equal(isOnboardingIntent("school"), true);
    assert.equal(isOnboardingIntent("organization"), true);
    assert.equal(isOnboardingIntent("hobby"), false);
    assert.equal(isSchoolIntent("teacher"), true);
    assert.equal(isSchoolIntent("parent"), true);
    assert.equal(isSchoolIntent("family"), false);
  });

  it("maps organization to nonprofit vault", () => {
    const org = vaultActionForIntent("organization");
    assert.equal(org.optionId, "nonprofit");
    assert.equal(org.profileType, "non_profit");
    assert.equal(suggestionKindForIntent("organization"), "business");
  });

  it("keeps personal and other on the auto vault", () => {
    for (const intent of ["personal", "other"] as const) {
      const action = vaultActionForIntent(intent);
      assert.equal(action.optionId, null);
      assert.equal(action.switchToNew, false);
      assert.equal(action.profileType, "personal");
      assert.equal(suggestionKindForIntent(intent), "personal");
    }
  });

  it("creates family and business vaults", () => {
    const family = vaultActionForIntent("family");
    assert.equal(family.optionId, "my_family");
    assert.equal(family.profileType, "family");
    assert.equal(family.switchToNew, true);
    assert.equal(suggestionKindForIntent("family"), "family");

    const business = vaultActionForIntent("business");
    assert.equal(business.optionId, "business");
    assert.equal(business.profileType, "business");
    assert.equal(suggestionKindForIntent("business"), "business");
  });

  it("maps school sub-intents to vault actions", () => {
    assert.equal(vaultActionForIntent("school", "teacher").profileType, "teacher");
    assert.equal(vaultActionForIntent("school", "student").profileType, "student");
    assert.equal(vaultActionForIntent("school", "parent").profileType, "child");
    assert.equal(suggestionKindForIntent("school", "teacher"), "teacher");
    assert.equal(suggestionKindForIntent("school", "student"), "student");
    assert.equal(suggestionKindForIntent("school", "parent"), "child");
  });

  it("defaults school without sub-intent to student", () => {
    assert.equal(vaultActionForIntent("school").profileType, "student");
    assert.equal(suggestionKindForIntent("school"), "student");
  });

  it("computes needsOnboarding from row flags", () => {
    assert.equal(
      computeNeedsOnboarding({
        onboarding_completed_at: null,
        onboarding_skipped: false,
      }),
      true
    );
    assert.equal(
      computeNeedsOnboarding({
        onboarding_completed_at: "2026-07-29T12:00:00Z",
        onboarding_skipped: false,
      }),
      false
    );
    assert.equal(
      computeNeedsOnboarding({
        onboarding_completed_at: null,
        onboarding_skipped: true,
      }),
      false
    );
  });

  it("tunes upload CTA and auto-question by profile kind", () => {
    assert.match(uploadCtaForProfileKind("business"), /invoice|contract/i);
    assert.match(uploadCtaForProfileKind("teacher"), /lesson/i);
    assert.match(uploadCtaForProfileKind("personal"), /document|photo/i);
    assert.match(
      autoQuestionForUpload({
        kind: "family",
        fileName: "camp.pdf",
        isImage: false,
      }),
      /dates|action/i
    );
    assert.match(
      autoQuestionForUpload({
        kind: "personal",
        fileName: "note.png",
        isImage: true,
      }),
      /image|transcribe/i
    );
  });
});
