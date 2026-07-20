import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lastSevenDayKeys } from "../days.ts";

describe("usage summary day keys", () => {
  it("returns 7 ascending calendar days ending today", () => {
    // Fixed instant: 2026-07-20 16:00 UTC ≈ afternoon Eastern
    const keys = lastSevenDayKeys(new Date("2026-07-20T16:00:00.000Z"));
    assert.equal(keys.length, 7);
    assert.equal(keys[6], "2026-07-20");
    assert.equal(keys[0], "2026-07-14");
  });
});
