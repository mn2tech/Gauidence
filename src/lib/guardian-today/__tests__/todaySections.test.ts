/**
 * Phase 5 — Today sections from Watch + guardian_events.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGuardianEventIntelligenceId,
  mapEventTypeToIntelligence,
  stripEventIntelligenceId,
  toIntelligenceItemFromEvent,
} from "../mapEvent.ts";
import {
  buildRecentFromEvents,
  dedupeEventItemsAgainstWatch,
  mergeAttentionLists,
} from "../sections.ts";
import type { GuardianEvent } from "@/lib/guardian-events/types.ts";
import type { GuardianIntelligenceItem } from "../types.ts";

function baseEvent(
  overrides: Partial<GuardianEvent> & Pick<GuardianEvent, "id" | "title">
): GuardianEvent {
  return {
    user_id: "u1",
    space_id: "space-a",
    event_type: "follow_up",
    summary: "Send demo",
    occurred_at: "2026-09-08T12:00:00.000Z",
    created_at: "2026-09-08T12:00:00.000Z",
    updated_at: "2026-09-08T12:00:00.000Z",
    source_type: "tell_guardian",
    source_id: null,
    dedupe_key: "k",
    importance_score: 0.75,
    action_required: true,
    status: "open",
    metadata: {},
    created_by: "user",
    confidence_score: null,
    ...overrides,
  };
}

function watchItem(
  overrides: Partial<GuardianIntelligenceItem> &
    Pick<GuardianIntelligenceItem, "id" | "title">
): GuardianIntelligenceItem {
  return {
    userId: "u1",
    spaceId: "space-a",
    spaceName: "NM2TECH",
    childName: null,
    sourceId: null,
    sourceType: "document",
    sourceDocumentId: null,
    sourceTitle: null,
    sourceExcerpt: null,
    type: "follow_up",
    summary: "Watch item",
    dueAt: null,
    effectiveDate: null,
    status: "open",
    priority: "high",
    score: 80,
    confidence: 0.9,
    reason: "due soon",
    suggestedAction: "Follow up",
    provenanceMessage: "from doc",
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
    origin: "watch_item",
    ...overrides,
  };
}

describe("Today mapEvent helpers", () => {
  it("prefixes and strips event intelligence ids", () => {
    assert.equal(isGuardianEventIntelligenceId("evt:abc"), true);
    assert.equal(stripEventIntelligenceId("evt:abc"), "abc");
    assert.equal(mapEventTypeToIntelligence("follow_up"), "follow_up");
  });

  it("maps open action events to Today cards", () => {
    const item = toIntelligenceItemFromEvent(
      baseEvent({ id: "e1", title: "Send Clark AI demo" }),
      "NM2TECH"
    );
    assert.equal(item.id, "evt:e1");
    assert.equal(item.origin, "guardian_event");
    assert.equal(item.type, "follow_up");
    assert.ok(item.score > 0);
  });
});

describe("Today section merge", () => {
  it("dedupes event cards that match Watch titles in the same space", () => {
    const watch = [watchItem({ id: "w1", title: "Send Clark AI demo" })];
    const events = [
      toIntelligenceItemFromEvent(
        baseEvent({ id: "e1", title: "Send Clark AI demo" }),
        "NM2TECH"
      ),
      toIntelligenceItemFromEvent(
        baseEvent({ id: "e2", title: "Different follow-up" }),
        "NM2TECH"
      ),
    ];
    const kept = dedupeEventItemsAgainstWatch(events, watch);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.id, "evt:e2");
  });

  it("merges attention with events sorted by score", () => {
    const merged = mergeAttentionLists(
      [watchItem({ id: "w1", title: "Watch", score: 50 })],
      [
        toIntelligenceItemFromEvent(
          baseEvent({ id: "e1", title: "Event", importance_score: 0.9 }),
          null
        ),
      ]
    );
    assert.equal(merged.length, 2);
    assert.ok(merged[0]!.score >= merged[1]!.score);
  });

  it("builds Recent from primary History events only", () => {
    const recent = buildRecentFromEvents(
      [
        baseEvent({
          id: "primary",
          title: "Met Onyx",
          event_type: "daily_log_entry",
          action_required: false,
        }),
        baseEvent({
          id: "twin",
          title: "Met Onyx",
          event_type: "meeting",
          action_required: false,
          metadata: { extracted_from_daily_log: true },
        }),
      ],
      new Map([["space-a", "NM2TECH"]]),
      10
    );
    assert.equal(recent.length, 1);
    assert.equal(recent[0]!.id, "primary");
    assert.equal(recent[0]!.spaceName, "NM2TECH");
  });
});
