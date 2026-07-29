import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completedStepCount,
  isActivationComplete,
  isOnboardingComplete,
  nextActivationChip,
  nextIncompleteStep,
  type OnboardingProgress,
} from "../onboarding.ts";

const empty: OnboardingProgress = {
  hasVault: false,
  hasDocument: false,
  hasDailyLog: false,
  hasAskedGideon: false,
};

describe("onboarding helpers", () => {
  it("points to document first (vault is automatic)", () => {
    assert.equal(nextIncompleteStep(empty)?.id, "document");
    assert.equal(completedStepCount(empty), 0);
    assert.equal(isOnboardingComplete(empty), false);
  });

  it("advances through steps in order", () => {
    assert.equal(
      nextIncompleteStep({ ...empty, hasVault: true })?.id,
      "document"
    );
    assert.equal(
      nextIncompleteStep({
        ...empty,
        hasVault: true,
        hasDocument: true,
      })?.id,
      "ask_gideon"
    );
    assert.equal(
      nextIncompleteStep({
        ...empty,
        hasVault: true,
        hasDocument: true,
        hasAskedGideon: true,
      })?.id,
      "daily_log"
    );
  });

  it("returns null when complete", () => {
    const done: OnboardingProgress = {
      hasVault: true,
      hasDocument: true,
      hasDailyLog: true,
      hasAskedGideon: true,
    };
    assert.equal(nextIncompleteStep(done), null);
    assert.equal(isOnboardingComplete(done), true);
    assert.equal(completedStepCount(done), 3);
  });

  it("tracks activation without requiring Daily Log", () => {
    assert.equal(isActivationComplete(empty), false);
    assert.equal(nextActivationChip(empty)?.step, 1);
    assert.equal(
      nextActivationChip({
        ...empty,
        hasDocument: true,
      })?.step,
      2
    );
    assert.equal(
      isActivationComplete({
        ...empty,
        hasDocument: true,
        hasAskedGideon: true,
      }),
      true
    );
    assert.equal(
      nextActivationChip({
        ...empty,
        hasDocument: true,
        hasAskedGideon: true,
      }),
      null
    );
  });
});
