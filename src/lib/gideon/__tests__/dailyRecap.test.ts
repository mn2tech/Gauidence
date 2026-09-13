import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDailyRecapDate, wantsDailyRecap } from "../dailyRecap";

describe("Gideon daily recap", () => {
  it("recognizes the production question", () => {
    assert.equal(wantsDailyRecap("what happened yesterday"), true);
    assert.equal(wantsDailyRecap("What happened with Larry yesterday?"), false);
  });

  it("resolves yesterday from the user's local calendar date", () => {
    assert.equal(
      resolveDailyRecapDate(
        "what happened yesterday",
        new Date("2026-09-13T02:00:00.000Z"),
        "America/New_York"
      ),
      "2026-09-11"
    );
  });
});
