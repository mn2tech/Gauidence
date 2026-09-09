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
  it("points to Tell Guardian first (mental-load win)", () => {
    assert.equal(nextIncompleteStep(empty)?.id, "daily_log");
    assert.equal(completedStepCount(empty), 0);
    assert.equal(isOnboardingComplete(empty), false);
  });

  it("advances through steps in order", () => {
    assert.equal(
      nextIncompleteStep({ ...empty, hasVault: true })?.id,
      "daily_log"
    );
    assert.equal(
      nextIncompleteStep({
        ...empty,
        hasVault: true,
        hasDailyLog: true,
      })?.id,
      "document"
    );
    assert.equal(
      nextIncompleteStep({
        ...empty,
        hasVault: true,
        hasDailyLog: true,
        hasDocument: true,
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
    assert.equal(completedStepCount(done), 3);
  });

  it("tracks activation from Tell Guardian without requiring Ask Gideon", () => {
    assert.equal(isActivationComplete(empty), false);
    assert.equal(nextActivationChip(empty)?.step, 1);
    assert.equal(nextActivationChip(empty)?.cta, "Tell Guardian");
    assert.equal(
      nextActivationChip({
        ...empty,
        hasDailyLog: true,
      })?.step,
      2
    );
    assert.equal(
      isActivationComplete({
        ...empty,
        hasDailyLog: true,
      }),
      true
    );
    assert.equal(
      nextActivationChip({
        ...empty,
        hasDailyLog: true,
        hasDocument: true,
      }),
      null
    );
  });
});
