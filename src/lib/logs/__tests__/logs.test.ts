import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLogDayHeading,
  isValidLogDate,
  scoreLogRelevance,
  todayLogDate,
} from "../types.ts";

describe("daily log helpers", () => {
  it("validates calendar dates", () => {
    assert.equal(isValidLogDate("2026-07-13"), true);
    assert.equal(isValidLogDate("2026-02-30"), false);
    assert.equal(isValidLogDate("07/13/2026"), false);
  });

  it("labels today and yesterday without shifting the calendar day", () => {
    const today = "2026-07-13";
    assert.match(formatLogDayHeading(today, today), /^Today —/);
    assert.match(formatLogDayHeading("2026-07-12", today), /^Yesterday —/);
  });

  it("scores relevant logs higher for keyword matches", () => {
    const log = {
      content: "Followed up with Onyx about Invoice #0000016",
      title: null,
      category: "Invoice",
      tags: ["Onyx"],
      log_date: todayLogDate(),
    };
    const hit = scoreLogRelevance(log, "What happened with Invoice #16?");
    const miss = scoreLogRelevance(log, "What is the weather like?");
    assert.ok(hit > miss);
  });
});
