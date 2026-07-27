import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDaysAsRelativeUnit } from "../dates";

describe("formatDaysAsRelativeUnit", () => {
  it("handles today, tomorrow, and past", () => {
    assert.equal(formatDaysAsRelativeUnit(-3), "Past");
    assert.equal(formatDaysAsRelativeUnit(0), "Today");
    assert.equal(formatDaysAsRelativeUnit(1), "Tomorrow");
  });

  it("uses days under a week", () => {
    assert.equal(formatDaysAsRelativeUnit(2), "2 days");
    assert.equal(formatDaysAsRelativeUnit(6), "6 days");
  });

  it("uses weeks from 7 to 29 days", () => {
    assert.equal(formatDaysAsRelativeUnit(7), "1 week");
    assert.equal(formatDaysAsRelativeUnit(13), "1 week");
    assert.equal(formatDaysAsRelativeUnit(14), "2 weeks");
    assert.equal(formatDaysAsRelativeUnit(29), "4 weeks");
  });

  it("uses months from 30 to 364 days", () => {
    assert.equal(formatDaysAsRelativeUnit(30), "1 month");
    assert.equal(formatDaysAsRelativeUnit(59), "1 month");
    assert.equal(formatDaysAsRelativeUnit(60), "2 months");
    assert.equal(formatDaysAsRelativeUnit(364), "12 months");
  });

  it("uses years from 365 days", () => {
    assert.equal(formatDaysAsRelativeUnit(365), "1 year");
    assert.equal(formatDaysAsRelativeUnit(729), "1 year");
    assert.equal(formatDaysAsRelativeUnit(730), "2 years");
  });
});
