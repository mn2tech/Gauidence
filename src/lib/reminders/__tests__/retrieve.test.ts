import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAlertsForGideon,
  scoreScheduleRelevance,
  type GideonScheduleAlert,
} from "../retrieve.ts";

const sample: GideonScheduleAlert = {
  id: "a1",
  profile_id: "p1",
  title: "Camp registration opens",
  due_date: "2026-07-28",
  due_at: "2026-07-28T13:00:00.000Z",
  source: "user",
  document_id: null,
};

describe("schedule retrieval helpers", () => {
  it("scores title matches higher for schedule questions", () => {
    const generic = scoreScheduleRelevance(sample, "summarize my vault");
    const specific = scoreScheduleRelevance(
      sample,
      "what reminders do I have for camp?"
    );
    assert.ok(specific > generic);
  });

  it("formats alerts for Gideon with vault and due labels", () => {
    const text = formatAlertsForGideon([sample], {
      profileNames: { p1: "Nolan" },
      timeZone: "America/New_York",
    });
    assert.match(text, /\[Reminder \| vault: Nolan/);
    assert.match(text, /Camp registration opens/);
    assert.match(text, /due:/i);
  });
});
