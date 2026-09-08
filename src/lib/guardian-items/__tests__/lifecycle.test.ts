/**
 * Temporal & Lifecycle Intelligence — unit tests.
 * Injectable `now` keeps comparisons deterministic (no LLM date math).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appNow, withAppNow } from "@/lib/clock";
import {
  evaluateLifecycle,
  followUpSuggestionsForCompletedEvent,
  formatTemporalHeader,
  isCurrentlyActionable,
  isStaleSuggestedQuestion,
  mapItemTypeToEntityType,
  partitionTemporalItems,
  toTemporalMetadata,
} from "../lifecycle";
import { reevaluateItemLifecycle } from "../lifecycle-transitions";
import { buildSuggestedQuestions } from "@/lib/gideon/suggestedQuestions";

const NOW = new Date("2026-09-08T12:00:00Z");

describe("app clock", () => {
  it("allows injecting a fixed now", () => {
    withAppNow(NOW, () => {
      assert.equal(appNow().toISOString(), NOW.toISOString());
    });
  });
});

describe("evaluateLifecycle — events", () => {
  it("1. future event → upcoming / actionable", () => {
    const r = evaluateLifecycle({
      entityType: "event",
      startDate: "2026-10-01",
      now: NOW,
    });
    assert.equal(r.lifecycleStatus, "upcoming");
    assert.equal(r.actionability, "actionable");
    assert.equal(r.actionState, "future");
  });

  it("2. event happening today → active / actionable", () => {
    const r = evaluateLifecycle({
      entityType: "event",
      startDate: "2026-09-08",
      now: NOW,
    });
    assert.equal(r.lifecycleStatus, "active");
    assert.equal(r.actionability, "actionable");
  });

  it("3. past event → completed / follow_up", () => {
    const r = evaluateLifecycle({
      entityType: "event",
      startDate: "2026-08-28",
      now: NOW,
    });
    assert.equal(r.lifecycleStatus, "completed");
    assert.equal(r.actionability, "follow_up");
    assert.equal(r.actionState, "completed");
  });
});

describe("Crossroads Connect acceptance", () => {
  it("past event + RSVP deadline → completed event, expired RSVP", () => {
    const event = evaluateLifecycle({
      entityType: "event",
      startDate: "2026-08-28",
      endDate: "2026-08-28",
      now: NOW,
      title: "Crossroads Connect",
    });
    assert.equal(event.lifecycleStatus, "completed");
    assert.equal(event.actionability, "follow_up");

    const rsvp = evaluateLifecycle({
      entityType: "deadline",
      dueDate: "2026-08-25",
      now: NOW,
      title: "RSVP for Crossroads Connect",
      sourceExcerpt: "RSVP required before the event",
    });
    assert.equal(rsvp.lifecycleStatus, "expired");
    assert.equal(rsvp.actionState, "expired");
    assert.equal(rsvp.actionability, "expired");
    assert.equal(rsvp.obsoleteActionKind, "rsvp");
    assert.equal(isCurrentlyActionable(toTemporalMetadata(rsvp)), false);
  });

  it("Gideon must not suggest Who RSVPed / Would you like to RSVP", () => {
    const qs = buildSuggestedQuestions({
      question: "Tell me about Crossroads Connect",
      answer:
        "Crossroads Connect was held August 28. Name: Jeff Hunt\nRSVP'd: August 3, 2026",
      entityNames: ["Crossroads Connect"],
      eventLifecycleStatus: "completed",
      eventName: "Crossroads Connect",
    });
    assert.ok(qs.length >= 1);
    assert.ok(!qs.some((q) => /who\s+(has\s+)?rsvp|would you like to rsvp/i.test(q)));
    assert.ok(
      qs.some((q) =>
        /meet|follow-?up|opportunit|commitment|notes|contacts/i.test(q)
      )
    );
  });

  it("flags RSVP suggestion chips as stale after the event (answers still allowed)", () => {
    // Stale check suppresses suggestion chips — retrieval/history still answer explicit asks.
    assert.equal(
      isStaleSuggestedQuestion({
        question: "Who RSVPed to Crossroads Connect?",
        eventLifecycle: "completed",
      }),
      true
    );
  });
});

describe("evaluateLifecycle — RSVP / meetings / solicitations / tasks / invoices", () => {
  it("4. RSVP deadline passed → expired", () => {
    const r = evaluateLifecycle({
      entityType: "deadline",
      dueDate: "2026-08-20",
      now: NOW,
      title: "RSVP by August 20",
    });
    assert.equal(r.actionState, "expired");
    assert.equal(r.actionability, "expired");
  });

  it("5. upcoming meeting → upcoming", () => {
    const r = evaluateLifecycle({
      entityType: "meeting",
      startDate: "2026-09-15",
      now: NOW,
      title: "Client sync meeting",
    });
    assert.equal(r.lifecycleStatus, "upcoming");
  });

  it("6. past meeting → completed / follow_up", () => {
    const r = evaluateLifecycle({
      entityType: "meeting",
      startDate: "2026-09-01",
      now: NOW,
      title: "Client sync meeting",
    });
    assert.equal(r.lifecycleStatus, "completed");
    assert.equal(r.actionability, "follow_up");
  });

  it("7. future solicitation → active / actionable", () => {
    const r = evaluateLifecycle({
      entityType: "solicitation",
      dueDate: "2026-10-15",
      now: NOW,
      title: "RFP submission",
    });
    assert.equal(r.lifecycleStatus, "active");
    assert.equal(r.actionability, "actionable");
  });

  it("8. closed solicitation → expired / informational", () => {
    const r = evaluateLifecycle({
      entityType: "solicitation",
      dueDate: "2026-08-01",
      now: NOW,
      title: "RFP submission deadline",
    });
    assert.equal(r.lifecycleStatus, "expired");
    assert.equal(r.actionability, "informational");
    assert.equal(isCurrentlyActionable(toTemporalMetadata(r)), false);
  });

  it("9. overdue task → overdue / actionable", () => {
    const r = evaluateLifecycle({
      entityType: "task",
      dueDate: "2026-09-01",
      now: NOW,
      title: "Send report",
    });
    assert.equal(r.lifecycleStatus, "overdue");
    assert.equal(r.actionability, "actionable");
    assert.equal(r.actionState, "overdue");
  });

  it("10. completed task → completed / informational", () => {
    const r = evaluateLifecycle({
      entityType: "task",
      dueDate: "2026-09-01",
      now: NOW,
      title: "Send report",
      completionEvidence: { completed: true },
    });
    assert.equal(r.lifecycleStatus, "completed");
    assert.equal(r.actionability, "informational");
  });

  it("11. paid invoice → completed (not inferred from age alone)", () => {
    const unpaidOld = evaluateLifecycle({
      entityType: "invoice",
      dueDate: "2026-01-01",
      now: NOW,
      title: "Invoice #44",
    });
    assert.equal(unpaidOld.lifecycleStatus, "overdue");

    const paid = evaluateLifecycle({
      entityType: "invoice",
      dueDate: "2026-01-01",
      now: NOW,
      title: "Invoice #44",
      completionEvidence: { paid: true },
    });
    assert.equal(paid.lifecycleStatus, "completed");
  });

  it("12. overdue unpaid invoice → overdue", () => {
    const r = evaluateLifecycle({
      entityType: "invoice",
      dueDate: "2026-08-01",
      now: NOW,
      title: "Invoice due",
    });
    assert.equal(r.lifecycleStatus, "overdue");
    assert.equal(r.actionState, "overdue");
  });

  it("13. historical document without actionable dates → unknown", () => {
    const r = evaluateLifecycle({
      entityType: "document",
      now: NOW,
      title: "Company handbook",
    });
    assert.equal(r.lifecycleStatus, "unknown");
    assert.equal(r.actionability, "informational");
  });

  it("14. document with multiple unrelated dates — evaluate by primary due", () => {
    const r = evaluateLifecycle({
      entityType: "deadline",
      startDate: "2026-01-01",
      dueDate: "2026-09-20",
      endDate: "2025-12-01",
      now: NOW,
      title: "Submit application",
    });
    // Primary due is future
    assert.ok(
      r.lifecycleStatus === "upcoming" ||
        r.lifecycleStatus === "due_soon" ||
        r.lifecycleStatus === "active"
    );
    assert.equal(r.actionability, "actionable");
  });

  it("15. explicit user query about expired item — suggestions stale, facts retained", () => {
    assert.equal(
      isStaleSuggestedQuestion({
        question: "Would you like to RSVP?",
        eventLifecycle: "completed",
      }),
      true
    );
    const followUps = followUpSuggestionsForCompletedEvent("Crossroads Connect");
    assert.ok(followUps.some((q) => /meet/i.test(q)));
  });
});

describe("partition + header", () => {
  it("partitions retrieved context", () => {
    const items = [
      {
        temporal: toTemporalMetadata(
          evaluateLifecycle({
            entityType: "event",
            startDate: "2026-10-01",
            now: NOW,
          })
        ),
      },
      {
        temporal: toTemporalMetadata(
          evaluateLifecycle({
            entityType: "task",
            dueDate: "2026-09-01",
            now: NOW,
          })
        ),
      },
      {
        temporal: toTemporalMetadata(
          evaluateLifecycle({
            entityType: "deadline",
            dueDate: "2026-08-01",
            now: NOW,
            title: "RSVP",
          })
        ),
      },
    ];
    const p = partitionTemporalItems(items);
    assert.equal(p.upcoming.length, 1);
    assert.equal(p.overdue.length, 1);
    assert.equal(p.expired.length, 1);
  });

  it("formats temporal header", () => {
    const header = formatTemporalHeader({
      now: NOW,
      timeZone: "UTC",
      lines: [
        "Crossroads Connect: completed event",
        "RSVP action: expired",
      ],
    });
    assert.match(header, /CURRENT DATE: September 8, 2026/);
    assert.match(header, /TEMPORAL INTERPRETATION/);
    assert.match(header, /Crossroads Connect/);
  });
});

describe("reevaluateItemLifecycle fixture", () => {
  it("Crossroads Connect event row after event date", () => {
    const reeval = reevaluateItemLifecycle(
      {
        type: "event",
        title: "Crossroads Connect",
        description: "Networking event",
        event_date: "2026-08-28",
        start_at: null,
        end_at: null,
        due_at: null,
        status: "active",
        requires_action: false,
        action_label: null,
        source_excerpt: "Event Date: August 28, 2026",
        confidence: 0.95,
        metadata: null,
      },
      { now: NOW, timeZone: "UTC" }
    );
    assert.equal(reeval.temporal.lifecycleStatus, "completed");
    assert.equal(reeval.temporal.actionability, "follow_up");
    assert.equal(reeval.followUpActionLabel, "Review contacts and opportunities");
  });

  it("RSVP row after deadline expires and shouldExpire", () => {
    const reeval = reevaluateItemLifecycle(
      {
        type: "deadline",
        title: "RSVP for Crossroads Connect",
        description: "RSVP required before the event",
        event_date: null,
        start_at: null,
        end_at: null,
        due_at: "2026-08-25T12:00:00.000Z",
        status: "active",
        requires_action: true,
        action_label: "RSVP",
        source_excerpt: "RSVP required before the event",
        confidence: 0.95,
        metadata: null,
      },
      { now: NOW, timeZone: "UTC" }
    );
    assert.equal(reeval.temporal.actionState, "expired");
    assert.equal(reeval.shouldExpire, true);
    assert.equal(isCurrentlyActionable(reeval.temporal), false);
  });
});

describe("mapItemTypeToEntityType", () => {
  it("detects solicitation and invoice cues", () => {
    assert.equal(
      mapItemTypeToEntityType("deadline", "RFP solicitation due"),
      "solicitation"
    );
    assert.equal(mapItemTypeToEntityType("payment", "Invoice #12"), "invoice");
    assert.equal(
      mapItemTypeToEntityType("appointment", "Client meeting sync"),
      "meeting"
    );
  });
});

describe("upcoming event suggestions still allow RSVP chips", () => {
  it("suggests RSVP / prepare for upcoming events", () => {
    const qs = buildSuggestedQuestions({
      question: "What do we know about the Fall Summit?",
      answer:
        "Fall Summit is on October 1. Name: Alex Rivera\nRSVP'd: pending",
      entityNames: ["Fall Summit"],
      eventLifecycleStatus: "upcoming",
      eventName: "Fall Summit",
    });
    assert.ok(qs.some((q) => /rsvp|prepare|meet/i.test(q)));
  });
});
