import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlan,
  PLAN_LIMITS,
  isPaidSubscriptionStatus,
} from "../plans.ts";
import { billingMonthStartIso } from "../quota.ts";

describe("billing plans", () => {
  it("defaults unknown plans to free", () => {
    assert.equal(normalizePlan(null), "free");
    assert.equal(normalizePlan("personal"), "personal");
  });

  it("exposes Free, Personal, Family, and Business monthly quotas", () => {
    assert.equal(PLAN_LIMITS.free.analyzePerMonth, 5);
    assert.equal(PLAN_LIMITS.personal.analyzePerMonth, 100);
    assert.equal(PLAN_LIMITS.family.analyzePerMonth, 200);
    assert.equal(PLAN_LIMITS.business.analyzePerMonth, 500);
    assert.equal(normalizePlan("family"), "family");
    assert.equal(normalizePlan("business"), "business");
  });

  it("treats active and trialing as paid", () => {
    assert.equal(isPaidSubscriptionStatus("active"), true);
    assert.equal(isPaidSubscriptionStatus("trialing"), true);
    assert.equal(isPaidSubscriptionStatus("canceled"), false);
  });

  it("billing month start is the first of the month UTC", () => {
    const start = billingMonthStartIso(new Date("2026-07-20T16:00:00Z"));
    assert.equal(start, "2026-07-01T00:00:00.000Z");
  });
});
