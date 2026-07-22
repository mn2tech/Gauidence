import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidPhoneE164, normalizePhoneE164 } from "../phone.ts";

describe("normalizePhoneE164", () => {
  it("normalizes 10-digit US numbers", () => {
    assert.equal(normalizePhoneE164("5551234567"), "+15551234567");
    assert.equal(normalizePhoneE164("(555) 123-4567"), "+15551234567");
  });

  it("keeps +1 numbers", () => {
    assert.equal(normalizePhoneE164("+15551234567"), "+15551234567");
  });

  it("rejects invalid input", () => {
    assert.equal(normalizePhoneE164(""), null);
    assert.equal(normalizePhoneE164("123"), null);
  });

  it("validates E.164", () => {
    assert.equal(isValidPhoneE164("+15551234567"), true);
    assert.equal(isValidPhoneE164("555"), false);
  });
});
