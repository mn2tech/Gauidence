import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completedStepCount,
  isOnboardingComplete,
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
  it("points to vault first", () => {
    assert.equal(nextIncompleteStep(empty)?.id, "vault");
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
      "daily_log"
    );
    assert.equal(
      nextIncompleteStep({
        ...empty,
        hasVault: true,
        hasDocument: true,
        hasDailyLog: true,
      })?.id,
      "ask_gideon"
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
    assert.equal(completedStepCount(done), 4);
  });
});
