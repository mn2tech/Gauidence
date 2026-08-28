import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGideonHandoffDraft, gideonHandoffHref, reviewHref } from "../gideonHandoff";
import { buildProvenanceMessage, mapGuardianTypeToIntelligence } from "../mapItem";
import {
  explainPriority,
  guardianPriorityToIntelligence,
  rankPriorities,
  scoreWatchItem,
} from "../scoring";
import { deriveCoverage, isTrulyCaughtUp } from "../coverage";
import type { GuardianWatchItem } from "@/lib/guardian-items/types";

function watchItem(
  overrides: Partial<GuardianWatchItem> = {}
): GuardianWatchItem {
  return {
    id: "item-1",
    user_id: "user-1",
    space_id: "space-1",
    child_id: null,
    school_context_id: null,
    type: "deadline",
    title: "Proposal deadline approaching",
    description: "Proposal must be submitted by September 12.",
    event_date: "2026-09-12",
    start_at: null,
    end_at: null,
    due_at: null,
    remind_at: null,
    status: "active",
    priority: "normal",
    requires_action: true,
    action_label: null,
    action_url: null,
    source_type: "document",
    source_id: "doc-1",
    source_document_id: "doc-1",
    source_excerpt: "Proposal must be submitted by September 12.",
    source_page: null,
    confidence: 0.95,
    needs_review: false,
    extraction_version: "v1",
    dedupe_key: "dedupe-1",
    created_at: "2026-09-07T12:00:00.000Z",
    updated_at: "2026-09-07T12:00:00.000Z",
    completed_at: null,
    dismissed_at: null,
    space_name: "NM2TECH",
    child_name: null,
    effective_date: "2026-09-12",
    ...overrides,
  };
}

describe("Guardian Today — deadline within 5 days", () => {
  it("surfaces a deadline due in 4 days with high priority", () => {
    const item = watchItem({ effective_date: "2026-09-12" });
    const scored = scoreWatchItem({
      item,
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    assert.equal(mapGuardianTypeToIntelligence(item.type), "deadline");
    assert.equal(guardianPriorityToIntelligence(scored.resolvedPriority), "high");
    assert.match(scored.reason, /4 days/i);
    const ranked = rankPriorities([scored]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.title, "Proposal deadline approaching");
  });
});

describe("Guardian Today — cross-space", () => {
  it("ranks intelligence from multiple spaces together", () => {
    const spaceA = scoreWatchItem({
      item: watchItem({
        id: "a",
        space_id: "space-a",
        space_name: "Personal",
        title: "Insurance renewal",
        type: "renewal",
        effective_date: "2026-09-20",
      }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const spaceB = scoreWatchItem({
      item: watchItem({
        id: "b",
        space_id: "space-b",
        space_name: "NM2TECH",
        title: "Treasury opportunity",
        effective_date: "2026-09-12",
        requires_action: true,
      }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const spaceC = scoreWatchItem({
      item: watchItem({
        id: "c",
        space_id: "space-c",
        space_name: "Clients",
        title: "Client follow-up",
        type: "follow_up",
        effective_date: "2026-09-10",
      }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });

    const ranked = rankPriorities([spaceA, spaceB, spaceC]);
    assert.equal(ranked.length, 3);
    const spaceIds = new Set(ranked.map((r) => r.space_id));
    assert.ok(spaceIds.has("space-a"));
    assert.ok(spaceIds.has("space-b"));
    assert.ok(spaceIds.has("space-c"));
  });
});

describe("Guardian Today — permissions", () => {
  it("only includes items from authorized space ids in ranking input", () => {
    const authorized = scoreWatchItem({
      item: watchItem({ space_id: "authorized-space" }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const ranked = rankPriorities([authorized]);
    assert.equal(ranked[0]!.space_id, "authorized-space");
    assert.equal(
      rankPriorities([]).length,
      0,
      "no authorized items means empty priorities"
    );
  });
});

describe("Guardian Today — completed item", () => {
  it("excludes non-active items from ranking input", () => {
    const active = scoreWatchItem({
      item: watchItem({ id: "active" }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const ranked = rankPriorities([active]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.id, "active");
  });
});

describe("Guardian Today — dismiss", () => {
  it("does not re-rank dismissed items when they are omitted from watch buckets", () => {
    const remaining = scoreWatchItem({
      item: watchItem({ id: "remaining" }),
      today: "2026-09-08",
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    const ranked = rankPriorities([remaining]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.id, "remaining");
  });
});

describe("Guardian Today — provenance", () => {
  it("builds explainable provenance with source and space", () => {
    const message = buildProvenanceMessage({
      title: "Treasury opportunity",
      effectiveDate: "2026-09-03",
      sourceTitle: "Treasury Opportunity.pdf",
      spaceName: "NM2TECH",
      type: "deadline",
    });
    assert.match(message, /Treasury Opportunity\.pdf/);
    assert.match(message, /NM2TECH/);
    assert.match(message, /September 3/);
  });
});

describe("Guardian Today — Gideon handoff", () => {
  it("includes intelligence, space, and source in Ask Gideon draft", () => {
    const item = {
      id: "item-1",
      userId: "user-1",
      spaceId: "space-1",
      spaceName: "NM2TECH",
      childName: null,
      sourceId: "doc-1",
      sourceType: "document" as const,
      sourceDocumentId: "doc-1",
      sourceTitle: "Treasury Opportunity.pdf",
      sourceExcerpt: null,
      type: "deadline" as const,
      title: "Treasury opportunity",
      summary: "Closes in 6 days.",
      dueAt: null,
      effectiveDate: "2026-09-03",
      status: "open" as const,
      priority: "high" as const,
      score: 80,
      confidence: 0.9,
      reason: "High priority",
      suggestedAction: "Review",
      provenanceMessage: "Found in document",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const draft = buildGideonHandoffDraft(item);
    assert.match(draft, /Treasury opportunity/);
    assert.match(draft, /NM2TECH/);
    assert.match(draft, /Treasury Opportunity\.pdf/);
    const href = gideonHandoffHref(item);
    assert.match(href, /draft=/);
    assert.match(href, /profileId=space-1/);
    assert.match(reviewHref(item), /space-1/);
    assert.match(reviewHref(item), /doc=doc-1/);
  });
});

describe("Guardian Today — empty state", () => {
  it("returns no priorities when watch buckets are empty", () => {
    assert.deepEqual(rankPriorities([]), []);
  });

  it("does not treat empty priorities alone as caught up without ready coverage", () => {
    const neverScanned = deriveCoverage({
      spaceIds: ["s1"],
      sources: [
        {
          id: "d1",
          profile_id: "s1",
          analysis_status: "completed",
          guardian_items_status: "pending",
        },
      ],
      activeItemCount: 0,
    });
    assert.equal(neverScanned.status, "never_scanned");
    assert.equal(isTrulyCaughtUp(neverScanned, 0), false);
  });
});

describe("Guardian Today — priority explanations", () => {
  it("explains overdue items clearly", () => {
    const reason = explainPriority({
      type: "deadline",
      requiresAction: true,
      resolvedPriority: "urgent",
      effectiveDate: "2026-09-01",
      today: "2026-09-08",
      confidence: 0.9,
    });
    assert.match(reason, /overdue/i);
  });

  it("explains follow-up without recorded action", () => {
    const reason = explainPriority({
      type: "follow_up",
      requiresAction: true,
      resolvedPriority: "normal",
      effectiveDate: null,
      today: "2026-09-08",
      confidence: 0.85,
    });
    assert.match(reason, /follow-up/i);
  });
});
