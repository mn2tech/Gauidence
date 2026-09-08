/**
 * Phase 3 — Tell Guardian derivation + History filters/timeline.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryTimeline,
  createMemoryGuardianEventStore,
  deriveEventsFromTellGuardian,
  formatHistoryDayHeading,
  historyEventTypeLabel,
  suggestSpaceIdFromText,
} from "../index.ts";
import type { GuardianEvent } from "../types.ts";

describe("Tell Guardian derivation", () => {
  it("creates meeting + follow-up from a promise note without requiring a Space", () => {
    const inputs = deriveEventsFromTellGuardian({
      userId: "user-a",
      text: "I met Clark today and promised to send him the AI demo next week.",
      now: new Date("2026-09-07T18:00:00.000Z"),
    });
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((i) => i.spaceId == null));
    assert.ok(inputs.every((i) => i.sourceType === "tell_guardian"));
    assert.equal(inputs[0]!.eventType, "meeting");
    assert.ok(inputs.some((i) => i.eventType === "follow_up" && i.actionRequired));
    assert.ok(
      inputs.every(
        (i) => typeof i.dedupeKey === "string" && i.dedupeKey.startsWith("tell:")
      )
    );
  });

  it("uses stable content dedupe keys (no timestamps)", () => {
    const text = "Decided to ship History v1 this week.";
    const a = deriveEventsFromTellGuardian({ userId: "u", text });
    const b = deriveEventsFromTellGuardian({
      userId: "u",
      text,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.deepEqual(
      a.map((i) => i.dedupeKey),
      b.map((i) => i.dedupeKey)
    );
  });

  it("suggests a Space only when exactly one display name matches", () => {
    const spaces = [
      { id: "s1", display_name: "NM2TECH" },
      { id: "s2", display_name: "Family" },
    ];
    assert.equal(
      suggestSpaceIdFromText("Update for NM2TECH board", spaces)?.spaceId,
      "s1"
    );
    assert.equal(
      suggestSpaceIdFromText("General thoughts", spaces),
      null
    );
  });
});

describe("History timeline helpers", () => {
  it("groups and filters meetings", () => {
    const events: GuardianEvent[] = [
      {
        id: "1",
        user_id: "u",
        space_id: null,
        event_type: "meeting",
        title: "Met Onyx",
        summary: "Client protection",
        occurred_at: "2026-09-07T12:00:00.000Z",
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
        source_type: "daily_log",
        source_id: "log-1",
        dedupe_key: "a",
        importance_score: 0.5,
        action_required: false,
        status: "open",
        metadata: { log_date: "2026-09-07" },
        created_by: "backfill",
        confidence_score: 1,
      },
      {
        id: "2",
        user_id: "u",
        space_id: null,
        event_type: "note",
        title: "Random",
        summary: null,
        occurred_at: "2026-09-06T12:00:00.000Z",
        created_at: "2026-09-06T12:00:00.000Z",
        updated_at: "2026-09-06T12:00:00.000Z",
        source_type: "manual",
        source_id: null,
        dedupe_key: null,
        importance_score: 0.5,
        action_required: false,
        status: "open",
        metadata: {},
        created_by: "user",
        confidence_score: null,
      },
    ];
    const meetings = buildHistoryTimeline(events, "meetings");
    assert.equal(meetings.length, 1);
    assert.equal(meetings[0]!.events[0]!.typeLabel, "Meeting");
    assert.match(meetings[0]!.events[0]!.sourceLabel, /Daily Log/);
  });

  it("labels today heading", () => {
    assert.equal(formatHistoryDayHeading("2026-09-07", "2026-09-07"), "Today");
    assert.equal(historyEventTypeLabel("follow_up"), "Follow-up");
  });

  it("Tell Guardian via memory store creates readable History events", () => {
    const store = createMemoryGuardianEventStore();
    const inputs = deriveEventsFromTellGuardian({
      userId: "user-a",
      text: "Decided to ship History v1 this week.",
    });
    for (const input of inputs) {
      const result = store.create(input);
      assert.equal(result.ok, true);
    }
    const listed = store.list({ userId: "user-a" });
    assert.ok(listed.length >= 1);
    assert.ok(listed.some((e) => e.source_type === "tell_guardian"));
  });

  it("rejects duplicate Tell Guardian notes in the memory store", () => {
    const store = createMemoryGuardianEventStore();
    const text = "I met Clark today and promised to send him the AI demo.";
    const first = deriveEventsFromTellGuardian({ userId: "user-a", text });
    const second = deriveEventsFromTellGuardian({ userId: "user-a", text });
    for (const input of first) {
      const result = store.create(input);
      assert.equal(result.ok && result.created, true);
    }
    for (const input of second) {
      const result = store.create(input);
      assert.equal(result.ok && result.created, false);
    }
    assert.equal(store.unsafeAll().length, first.length);
  });

  it("hides extracted twins on the default History filter", () => {
    const events: GuardianEvent[] = [
      {
        id: "primary",
        user_id: "u",
        space_id: null,
        event_type: "daily_log_entry",
        title: "Today",
        summary: "Met Clark",
        occurred_at: "2026-09-07T12:00:00.000Z",
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
        source_type: "daily_log",
        source_id: "log-1",
        dedupe_key: "daily_log_entry:entry:primary",
        importance_score: 0.5,
        action_required: false,
        status: "open",
        metadata: { log_date: "2026-09-07" },
        created_by: "backfill",
        confidence_score: 1,
      },
      {
        id: "extracted",
        user_id: "u",
        space_id: null,
        event_type: "meeting",
        title: "Met Clark",
        summary: "Met Clark",
        occurred_at: "2026-09-07T12:00:00.000Z",
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:00:00.000Z",
        source_type: "daily_log",
        source_id: "log-1",
        dedupe_key: "meeting:met clark:2026-09-07",
        importance_score: 0.5,
        action_required: false,
        status: "open",
        metadata: {
          log_date: "2026-09-07",
          extracted_from_daily_log: true,
        },
        created_by: "backfill",
        confidence_score: 1,
      },
    ];
    const all = buildHistoryTimeline(events, "all");
    assert.equal(all.reduce((n, g) => n + g.events.length, 0), 1);
    const meetings = buildHistoryTimeline(events, "meetings");
    assert.equal(meetings.reduce((n, g) => n + g.events.length, 0), 1);
  });
});
