import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlanLimitMessage,
  normalizePlanLimitMessage,
  shouldShowPlanUpgradeLink,
} from "../limitError.ts";

describe("plan limit errors", () => {
  it("detects monthly plan limit copy", () => {
    assert.equal(
      isPlanLimitMessage(
        "You've used all 30 Ask Gideon / chat turns on the Free plan this month."
      ),
      true
    );
  });

  it("strips legacy Settings upgrade suffix", () => {
    assert.equal(
      normalizePlanLimitMessage(
        "You've used all 30 Ask Gideon / chat turns on the Free plan this month. Upgrade to Personal, Family, or Business in Settings for higher limits."
      ),
      "You've used all 30 Ask Gideon / chat turns on the Free plan this month."
    );
  });

  it("shows upgrade link from message even without API code", () => {
    assert.equal(
      shouldShowPlanUpgradeLink(
        "You've used all 30 Ask Gideon / chat turns on the Free plan this month. Upgrade to Personal, Family, or Business in Settings for higher limits."
      ),
      true
    );
  });
});
