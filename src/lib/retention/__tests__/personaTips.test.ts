import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOnboardingIntent, tipForIntent } from "../personaTips.ts";

describe("retention persona tips", () => {
  it("parses onboarding intent", () => {
    assert.equal(parseOnboardingIntent("family"), "family");
    assert.equal(parseOnboardingIntent("nope"), null);
  });

  it("returns family-specific document nudge copy", () => {
    const tip = tipForIntent("family", "nudge_no_document");
    assert.match(tip.bodyExtra, /school flyer|newsletter/i);
    assert.match(tip.ctaLabel, /flyer|upload/i);
  });

  it("returns business-specific welcome copy", () => {
    const tip = tipForIntent("business", "welcome");
    assert.match(tip.example, /invoice|contract/i);
  });

  it("falls back to other when intent is null", () => {
    const tip = tipForIntent(null, "welcome");
    assert.match(tip.ctaLabel, /document/i);
  });
});
