import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasConsecutiveLogStreak } from "../streak.ts";

describe("hasConsecutiveLogStreak", () => {
  it("returns false for fewer than seven days", () => {
    assert.equal(
      hasConsecutiveLogStreak(["2026-01-01", "2026-01-02", "2026-01-03"]),
      false
    );
  });

  it("detects seven consecutive days", () => {
    assert.equal(
      hasConsecutiveLogStreak([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
      ]),
      true
    );
  });

  it("ignores duplicate dates", () => {
    assert.equal(
      hasConsecutiveLogStreak([
        "2026-01-01",
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
      ]),
      true
    );
  });

  it("resets streak after a gap", () => {
    assert.equal(
      hasConsecutiveLogStreak([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-10",
        "2026-01-11",
        "2026-01-12",
        "2026-01-13",
        "2026-01-14",
        "2026-01-15",
        "2026-01-16",
      ]),
      true
    );
    assert.equal(
      hasConsecutiveLogStreak([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-10",
        "2026-01-11",
      ]),
      false
    );
  });
});
