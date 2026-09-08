/**
 * Phase 1 guardian_events — auth, repository semantics, provenance, sort.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGuardianEventDedupeKey,
  canReadGuardianEvent,
  canWriteGuardianEventSpace,
  createMemoryGuardianEventStore,
  dailyLogEntryDedupeKey,
  filterReadableGuardianEvents,
  formatGuardianEventSourceLabel,
  getGuardianEventSourceRef,
  groupGuardianEventsByDate,
  sortGuardianEventsByOccurredAt,
  tellGuardianDedupeKey,
} from "../index.ts";
import type { GuardianEvent } from "../types.ts";

function baseEvent(
  overrides: Partial<GuardianEvent> &
    Pick<GuardianEvent, "id" | "user_id" | "space_id" | "title">
): GuardianEvent {
  return {
    event_type: "note",
    summary: null,
    occurred_at: "2026-09-07T12:00:00.000Z",
    created_at: "2026-09-07T12:00:00.000Z",
    updated_at: "2026-09-07T12:00:00.000Z",
    source_type: "manual",
    source_id: null,
    dedupe_key: null,
    importance_score: 0.5,
    action_required: false,
    status: "open",
    metadata: {},
    created_by: "user",
    confidence_score: null,
    ...overrides,
  };
}

describe("guardian_events auth", () => {
  it("allows reading unscoped events only for the owning user", () => {
    const event = baseEvent({
      id: "1",
      user_id: "user-a",
      space_id: null,
      title: "Private note",
    });
    assert.equal(
      canReadGuardianEvent(event, {
        userId: "user-a",
        authorizedSpaceIds: [],
      }),
      true
    );
    assert.equal(
      canReadGuardianEvent(event, {
        userId: "user-b",
        authorizedSpaceIds: ["space-x"],
      }),
      false
    );
  });

  it("allows reading spaced events only when space is authorized", () => {
    const event = baseEvent({
      id: "2",
      user_id: "user-a",
      space_id: "space-nm2",
      title: "NM2 note",
    });
    assert.equal(
      canReadGuardianEvent(event, {
        userId: "user-b",
        authorizedSpaceIds: ["space-nm2"],
      }),
      true
    );
    assert.equal(
      canReadGuardianEvent(event, {
        userId: "user-b",
        authorizedSpaceIds: ["space-other"],
      }),
      false
    );
  });

  it("denies writes to spaces the user cannot edit", () => {
    assert.equal(
      canWriteGuardianEventSpace("space-nm2", {
        userId: "user-a",
        editableSpaceIds: [],
      }),
      false
    );
    assert.equal(
      canWriteGuardianEventSpace(null, {
        userId: "user-a",
        editableSpaceIds: [],
      }),
      true
    );
  });

  it("filters cross-user leakage from mixed lists", () => {
    const events = [
      baseEvent({
        id: "a",
        user_id: "user-a",
        space_id: null,
        title: "A private",
      }),
      baseEvent({
        id: "b",
        user_id: "user-b",
        space_id: null,
        title: "B private",
      }),
      baseEvent({
        id: "c",
        user_id: "user-a",
        space_id: "space-shared",
        title: "Shared",
      }),
    ];
    const visible = filterReadableGuardianEvents(events, {
      userId: "user-b",
      authorizedSpaceIds: ["space-shared"],
    });
    // Own unscoped + authorized space; never another user's unscoped.
    assert.deepEqual(
      visible.map((e) => e.id).sort(),
      ["b", "c"]
    );
    assert.ok(!visible.some((e) => e.id === "a"));
  });
});

describe("guardian_events memory repository", () => {
  it("creates an event without a Space", () => {
    const store = createMemoryGuardianEventStore();
    const result = store.create({
      userId: "user-a",
      eventType: "note",
      title: "Told Guardian something",
      sourceType: "tell_guardian",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.space_id, null);
    assert.equal(result.data.source_type, "tell_guardian");
  });

  it("associates an unscoped event with a Space later", () => {
    const store = createMemoryGuardianEventStore();
    store.grantAccess("space-family", "user-a", "editor");
    const created = store.create({
      userId: "user-a",
      eventType: "meeting",
      title: "Met Clark",
      summary: "Promised AI demo next week",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const associated = store.associateSpace(
      "user-a",
      created.data.id,
      "space-family",
      0.82
    );
    assert.equal(associated.ok, true);
    if (!associated.ok) return;
    assert.equal(associated.data.space_id, "space-family");
    assert.equal(associated.data.confidence_score, 0.82);
  });

  it("prevents User A from seeing User B unscoped events", () => {
    const store = createMemoryGuardianEventStore();
    store.create({
      userId: "user-a",
      eventType: "note",
      title: "A secret",
    });
    store.create({
      userId: "user-b",
      eventType: "note",
      title: "B secret",
    });
    const forA = store.list({ userId: "user-a" });
    const forB = store.list({ userId: "user-b" });
    assert.equal(forA.length, 1);
    assert.equal(forA[0]!.title, "A secret");
    assert.equal(forB.length, 1);
    assert.equal(forB[0]!.title, "B secret");
  });

  it("prevents reading events from unauthorized Spaces", () => {
    const store = createMemoryGuardianEventStore();
    store.grantAccess("space-nm2", "user-a", "owner");
    store.grantAccess("space-client", "user-b", "editor");

    const created = store.create({
      userId: "user-a",
      spaceId: "space-nm2",
      eventType: "decision",
      title: "Ship History v1",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(store.get("user-b", created.data.id), null);
    assert.equal(store.list({ userId: "user-b" }).length, 0);
    assert.equal(store.list({ userId: "user-a" }).length, 1);
  });

  it("rejects create into a Space the user cannot edit", () => {
    const store = createMemoryGuardianEventStore();
    store.grantAccess("space-nm2", "user-viewer", "viewer");
    const result = store.create({
      userId: "user-viewer",
      spaceId: "space-nm2",
      eventType: "note",
      title: "Should fail",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 403);
  });

  it("creates from Daily Log provenance without mutating a log id", () => {
    const store = createMemoryGuardianEventStore();
    store.grantAccess("space-personal", "user-a", "owner");
    const dailyLogId = "11111111-1111-1111-1111-111111111111";
    const result = store.create({
      userId: "user-a",
      spaceId: "space-personal",
      eventType: "daily_log_entry",
      title: "August 27 notes",
      summary: "Met with Onyx regarding client protection.",
      sourceType: "daily_log",
      sourceId: dailyLogId,
      dedupeKey: dailyLogEntryDedupeKey(),
      createdBy: "backfill",
      metadata: { log_date: "2026-08-27" },
      occurredAt: "2026-08-27T16:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.source_id, dailyLogId);
    assert.equal(result.data.source_type, "daily_log");
    assert.equal(
      formatGuardianEventSourceLabel(result.data),
      "Daily Log — August 27, 2026"
    );
    assert.equal(getGuardianEventSourceRef(result.data).sourceId, dailyLogId);
  });

  it("is idempotent for the same source + dedupe_key", () => {
    const store = createMemoryGuardianEventStore();
    const dailyLogId = "22222222-2222-2222-2222-222222222222";
    const input = {
      userId: "user-a",
      eventType: "daily_log_entry" as const,
      title: "Same log",
      sourceType: "daily_log",
      sourceId: dailyLogId,
      dedupeKey: dailyLogEntryDedupeKey(),
      createdBy: "backfill" as const,
    };
    const first = store.create(input);
    const second = store.create(input);
    assert.equal(first.ok && first.created, true);
    assert.equal(second.ok && second.created, false);
    if (!first.ok || !second.ok) return;
    assert.equal(first.data.id, second.data.id);
    assert.equal(store.unsafeAll().length, 1);
  });

  it("sorts History newest-first and groups by date", () => {
    const events = [
      baseEvent({
        id: "old",
        user_id: "u",
        space_id: null,
        title: "Older",
        occurred_at: "2026-09-01T10:00:00.000Z",
        created_at: "2026-09-01T10:00:00.000Z",
      }),
      baseEvent({
        id: "new",
        user_id: "u",
        space_id: null,
        title: "Newer",
        occurred_at: "2026-09-07T10:00:00.000Z",
        created_at: "2026-09-07T10:00:00.000Z",
      }),
      baseEvent({
        id: "mid",
        user_id: "u",
        space_id: null,
        title: "Mid",
        occurred_at: "2026-09-07T08:00:00.000Z",
        created_at: "2026-09-07T08:00:00.000Z",
      }),
    ];
    const sorted = sortGuardianEventsByOccurredAt(events);
    assert.deepEqual(
      sorted.map((e) => e.id),
      ["new", "mid", "old"]
    );
    const groups = groupGuardianEventsByDate(events);
    assert.equal(groups[0]!.date, "2026-09-07");
    assert.equal(groups[0]!.events.length, 2);
    assert.equal(groups[1]!.date, "2026-09-01");
  });

  it("lists open follow-ups for Today and hides completed ones", () => {
    const store = createMemoryGuardianEventStore();
    const open = store.create({
      userId: "user-a",
      eventType: "follow_up",
      title: "Send Clark AI demo",
      actionRequired: true,
      status: "open",
    });
    const done = store.create({
      userId: "user-a",
      eventType: "follow_up",
      title: "Old follow-up",
      actionRequired: true,
      status: "open",
    });
    assert.equal(open.ok && done.ok, true);
    if (!open.ok || !done.ok) return;

    store.setStatus("user-a", done.data.id, "completed");

    const active = store.list({
      userId: "user-a",
      actionRequired: true,
      statuses: ["open"],
    });
    assert.equal(active.length, 1);
    assert.equal(active[0]!.title, "Send Clark AI demo");
  });
});

describe("guardian_events dedupe + provenance helpers", () => {
  it("builds stable dedupe keys", () => {
    assert.equal(
      buildGuardianEventDedupeKey({
        eventType: "meeting",
        title: "  Met Clark  ",
      }),
      "meeting:met clark"
    );
    assert.match(dailyLogEntryDedupeKey(), /^daily_log_entry:/);
    assert.match(
      tellGuardianDedupeKey({
        eventType: "note",
        text: "Hello world",
      }),
      /^tell:note:/
    );
    assert.equal(
      tellGuardianDedupeKey({ eventType: "note", text: "Hello world" }),
      tellGuardianDedupeKey({ eventType: "note", text: "  hello   world  " })
    );
  });

  it("formats source labels for documents and manual notes", () => {
    assert.equal(
      formatGuardianEventSourceLabel({
        source_type: "document",
        source_id: "doc-1",
        metadata: {},
      }),
      "Uploaded document"
    );
    assert.equal(
      formatGuardianEventSourceLabel({
        source_type: "manual",
        source_id: null,
        metadata: {},
      }),
      "Manual note"
    );
  });
});
