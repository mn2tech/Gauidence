import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUserReferralCode,
  utcYearStartIso,
  REFERRAL_MAX_PER_YEAR,
  REFERRAL_REWARD_CENTS,
} from "../referralConstants";

describe("referral helpers", () => {
  it("accepts 8-char hex user codes only", () => {
    assert.equal(isUserReferralCode("a1b2c3d4"), true);
    assert.equal(isUserReferralCode("A1B2C3D4"), true);
    assert.equal(isUserReferralCode("olney-nno"), false);
    assert.equal(isUserReferralCode("abc"), false);
    assert.equal(isUserReferralCode(""), false);
    assert.equal(isUserReferralCode(null), false);
  });

  it("uses UTC calendar year start", () => {
    const iso = utcYearStartIso(new Date("2026-08-30T04:00:00.000Z"));
    assert.equal(iso, "2026-01-01T00:00:00.000Z");
  });

  it("defines Pro-month reward and yearly cap", () => {
    assert.equal(REFERRAL_REWARD_CENTS, 999);
    assert.equal(REFERRAL_MAX_PER_YEAR, 3);
  });
});
