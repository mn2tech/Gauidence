import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  guardianReferralCode,
  guardianShareMessage,
  guardianTryUrl,
} from "../guardian";

describe("guardian share helpers", () => {
  it("derives a short referral code from user id", () => {
    assert.equal(
      guardianReferralCode("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      "a1b2c3d4"
    );
  });

  it("builds try url without ref", () => {
    assert.match(guardianTryUrl(), /\/try$/);
  });

  it("builds try url with ref", () => {
    const url = guardianTryUrl("abc123");
    assert.ok(url.endsWith("?ref=abc123"));
  });

  it("formats share message with url", () => {
    const msg = guardianShareMessage("https://example.com/try");
    assert.ok(msg.includes("Try Guardian"));
    assert.ok(msg.includes("https://example.com/try"));
  });
});
