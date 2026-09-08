/**
 * Phase 6 — Gideon History event scoring / formatting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatGuardianEventsForGideon,
  inferGuardianEventTimeWindow,
  scoreGuardianEventRelevance,
  wantsGuardianEventRetrieval,
  wantsOpenPromiseEvents,
  type GideonGuardianEvent,
} from "../forGideon.ts";

function event(
  overrides: Partial<GideonGuardianEvent> & Pick<GideonGuardianEvent, "id" | "title">
): GideonGuardianEvent {
  return {
    space_id: "s1",
    event_type: "follow_up",
    summary: "Send AI demo",
    occurred_at: "2026-09-07T18:00:00.000Z",
    action_required: true,
    status: "open",
    space_name: "NM2TECH",
    source_label: "Manual note",
    ...overrides,
  };
}

describe("Gideon guardian_events helpers", () => {
  it("detects History / promise questions", () => {
    assert.equal(
      wantsGuardianEventRetrieval("What did I do last week?"),
      true
    );
    assert.equal(
      wantsOpenPromiseEvents("What promises have I made that are still open?"),
      true
    );
    assert.equal(wantsGuardianEventRetrieval("What is 2+2?"), false);
  });

  it("infers last-week and August windows", () => {
    const now = new Date("2026-09-08T15:00:00.000Z");
    const week = inferGuardianEventTimeWindow("What did I do last week?", now);
    assert.ok(week.occurredFrom);
    assert.ok(week.occurredTo);
    assert.equal(week.label, "last week");

    const aug = inferGuardianEventTimeWindow(
      "Show everything related to Onyx in August",
      now
    );
    assert.equal(aug.label, "august 2026");
    assert.ok(aug.occurredFrom?.startsWith("2026-08-01"));
    assert.ok(aug.occurredTo?.startsWith("2026-09-01"));
  });

  it("boosts open follow-ups for promise questions", () => {
    const open = event({ id: "1", title: "Send Clark demo" });
    const closed = event({
      id: "2",
      title: "Send Clark demo",
      status: "completed",
      action_required: false,
    });
    const q = "What promises are still open?";
    assert.ok(
      scoreGuardianEventRelevance(open, q) >
        scoreGuardianEventRelevance(closed, q)
    );
  });

  it("formats lines with Source provenance", () => {
    const text = formatGuardianEventsForGideon([
      event({
        id: "1",
        title: "Send Clark AI demo",
        source_label: "Daily Log — August 27, 2026",
      }),
    ]);
    assert.match(text, /Send Clark AI demo/);
    assert.match(text, /Source: Daily Log — August 27, 2026/);
    assert.match(text, /open action/);
  });
});
