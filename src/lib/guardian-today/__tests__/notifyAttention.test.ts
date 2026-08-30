import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyWatchBucket } from "@/lib/guardian-items/dates";

describe("attention notify bucket selection", () => {
  it("treats near-term summit as needsAttention for notify cron", () => {
    assert.equal(
      classifyWatchBucket({
        type: "event",
        requiresAction: false,
        priority: "normal",
        effectiveDate: "2026-09-01",
        today: "2026-08-29",
        horizonDays: 30,
      }),
      "needsAttention"
    );
  });
});
