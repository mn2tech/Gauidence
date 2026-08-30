import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planAllowsOutboundDigests } from "../notifyEntitlements";

describe("notifyEntitlements", () => {
  it("allows paid plans only", () => {
    assert.equal(planAllowsOutboundDigests("free"), false);
    assert.equal(planAllowsOutboundDigests("personal"), true);
    assert.equal(planAllowsOutboundDigests("family"), true);
    assert.equal(planAllowsOutboundDigests("business"), true);
    assert.equal(planAllowsOutboundDigests(null), false);
  });
});
