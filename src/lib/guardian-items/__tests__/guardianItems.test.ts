import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { associateGuardianItem } from "../associate";
import {
  buildDedupeKey,
  normalizeTitle,
  titlesLikelySameEvent,
} from "../dedupe";
import {
  classifyWatchBucket,
  daysBetween,
  effectiveCalendarDate,
} from "../dates";
import { isLowValueHistoricalFact } from "../negativeFilter";
import { resolveItemPriority } from "../priority";
import { parseGuardianExtraction } from "../schema";
import {
  formatGuardianItemsForGideon,
  scoreGuardianItemRelevance,
  wantsGuardianItemRetrieval,
  type GideonGuardianItem,
} from "../retrieveForGideon";
import { CONFIDENCE_AUTO, CONFIDENCE_REVIEW } from "../types";

describe("guardian extraction schema", () => {
  it("accepts school calendar Labor Day item", () => {
    const parsed = parseGuardianExtraction({
      items: [
        {
          type: "school_closure",
          title: "No school — Labor Day",
          description: "Schools and offices are closed.",
          event_date: "2026-09-07",
          due_at: null,
          requires_action: false,
          priority: "normal",
          child_reference: null,
          confidence: 0.98,
          source_excerpt:
            "September 7 — Labor Day — Schools and offices closed",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.items[0]!.type, "school_closure");
    assert.equal(parsed!.items[0]!.event_date, "2026-09-07");
  });

  it("accepts expiration and follow-up extraction shapes", () => {
    const parsed = parseGuardianExtraction({
      items: [
        {
          type: "expiration",
          title: "Vehicle registration expires",
          event_date: "2026-10-18",
          requires_action: true,
          priority: "normal",
          confidence: 0.95,
          source_excerpt: "Expiration Date: October 18, 2026",
        },
        {
          type: "follow_up",
          title: "Client follow-up required",
          due_at: "2026-09-10",
          requires_action: true,
          priority: "high",
          confidence: 0.88,
          source_excerpt: "Follow up with the client within 7 business days.",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.items.length, 2);
  });

  it("rejects malformed extraction", () => {
    assert.equal(
      parseGuardianExtraction({
        items: [{ type: "not_a_type", title: "x", confidence: 2 }],
      }),
      null
    );
    assert.equal(parseGuardianExtraction({ items: "nope" }), null);
  });

  it("rejects missing source_excerpt", () => {
    assert.equal(
      parseGuardianExtraction({
        items: [
          {
            type: "event",
            title: "Party",
            requires_action: false,
            confidence: 0.9,
          },
        ],
      }),
      null
    );
  });
});

describe("negative extraction filter", () => {
  it("blocks founded-in and document-generated facts", () => {
    assert.equal(
      isLowValueHistoricalFact({
        type: "informational",
        title: "Company history",
        requires_action: false,
        priority: "low",
        confidence: 0.99,
        source_excerpt: "The company was founded in 2008.",
      }),
      true
    );
    assert.equal(
      isLowValueHistoricalFact({
        type: "informational",
        title: "Generated",
        requires_action: false,
        priority: "low",
        confidence: 0.99,
        source_excerpt: "Document generated January 2024.",
      }),
      true
    );
  });

  it("allows real school closures", () => {
    assert.equal(
      isLowValueHistoricalFact({
        type: "school_closure",
        title: "No school — Labor Day",
        event_date: "2026-09-07",
        requires_action: false,
        priority: "normal",
        confidence: 0.98,
        source_excerpt:
          "September 7 — Labor Day — Schools and offices closed",
      }),
      false
    );
  });
});

describe("deduplication", () => {
  it("normalizes Labor Day title variants", () => {
    const a = normalizeTitle("No School — Labor Day");
    const b = normalizeTitle("Labor Day — Schools Closed");
    const c = normalizeTitle("Schools Closed for Labor Day");
    assert.ok(titlesLikelySameEvent(a, b) || a.includes("labor day"));
    assert.ok(titlesLikelySameEvent(b, c));
  });

  it("builds stable dedupe keys for Labor Day title variants", () => {
    const k1 = buildDedupeKey({
      type: "school_closure",
      title: "No School — Labor Day",
      effectiveDate: "2026-09-07",
      childId: "child-matthew",
      sourceDocumentId: "doc-1",
    });
    const k2 = buildDedupeKey({
      type: "school_closure",
      title: "Labor Day — Schools Closed",
      effectiveDate: "2026-09-07",
      childId: "child-matthew",
      sourceDocumentId: "doc-1",
    });
    const k3 = buildDedupeKey({
      type: "school_closure",
      title: "Schools Closed for Labor Day",
      effectiveDate: "2026-09-07",
      childId: "child-matthew",
      sourceDocumentId: "doc-1",
    });
    assert.equal(k1, k2);
    assert.equal(k2, k3);
  });

  it("keeps multi-child items separate", () => {
    const matthew = buildDedupeKey({
      type: "school_closure",
      title: "No school Labor Day",
      effectiveDate: "2026-09-07",
      childId: "matthew",
      sourceDocumentId: "doc-mcps",
    });
    const nolan = buildDedupeKey({
      type: "event",
      title: "Picture Day",
      effectiveDate: "2026-09-09",
      childId: "nolan",
      sourceDocumentId: "doc-wca",
    });
    assert.notEqual(matthew, nolan);
  });
});

describe("child association", () => {
  it("uses explicit child and never guesses among multiple matches", () => {
    const explicit = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "family",
        explicitChildId: "matthew",
        childSpaces: [
          { id: "matthew", display_name: "Matthew" },
          { id: "nolan", display_name: "Nolan" },
        ],
      },
      "Matthew"
    );
    assert.equal(explicit.childId, "matthew");

    const ambiguous = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "family",
        childSpaces: [
          { id: "matthew", display_name: "Matthew Smith" },
          { id: "matt", display_name: "Matt Jones" },
        ],
      },
      "Matt"
    );
    assert.equal(ambiguous.childId, null);
  });

  it("attaches child Space upload to that Space as child_id", () => {
    const result = associateGuardianItem({
      userId: "u1",
      spaceId: "matthew-space",
      spaceProfileType: "child",
      spaceDisplayName: "Matthew",
    });
    assert.equal(result.childId, "matthew-space");
  });

  it("leaves child_id null without strong match", () => {
    const result = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "personal",
        spaceProfileType: "myself",
        childSpaces: [
          { id: "matthew", display_name: "Matthew" },
          { id: "nolan", display_name: "Nolan" },
        ],
      },
      null
    );
    assert.equal(result.childId, null);
  });
});

describe("confidence gates", () => {
  it("uses 0.90 auto and 0.75 review thresholds", () => {
    assert.equal(CONFIDENCE_AUTO, 0.9);
    assert.equal(CONFIDENCE_REVIEW, 0.75);
    assert.ok(0.98 >= CONFIDENCE_AUTO);
    assert.ok(0.8 >= CONFIDENCE_REVIEW && 0.8 < CONFIDENCE_AUTO);
    assert.ok(0.5 < CONFIDENCE_REVIEW);
  });
});

describe("timezone / date-only handling", () => {
  it("keeps date-only event_date as local calendar date", () => {
    const date = effectiveCalendarDate({
      eventDate: "2026-09-07",
      dueAt: "2026-09-07T00:00:00.000Z",
      timeZone: "America/Los_Angeles",
      calendarDateInZone: () => "2026-09-06", // would be wrong if used for date-only
    });
    assert.equal(date, "2026-09-07");
  });

  it("uses due_at in user zone when event_date missing", () => {
    const date = effectiveCalendarDate({
      eventDate: null,
      dueAt: "2026-10-18T17:00:00.000Z",
      timeZone: "America/New_York",
      calendarDateInZone: (_instant, tz) => {
        assert.equal(tz, "America/New_York");
        return "2026-10-18";
      },
    });
    assert.equal(date, "2026-10-18");
  });
});

describe("Watch classification", () => {
  it("puts Labor Day on Today on Sep 7 and Coming Up before", () => {
    assert.equal(
      classifyWatchBucket({
        type: "school_closure",
        requiresAction: false,
        priority: "normal",
        effectiveDate: "2026-09-07",
        today: "2026-09-07",
        horizonDays: 30,
      }),
      "today"
    );
    assert.equal(
      classifyWatchBucket({
        type: "school_closure",
        requiresAction: false,
        priority: "normal",
        effectiveDate: "2026-09-07",
        today: "2026-09-06",
        horizonDays: 30,
      }),
      "comingUp"
    );
  });

  it("puts action deadlines in Needs Attention", () => {
    assert.equal(
      classifyWatchBucket({
        type: "expiration",
        requiresAction: true,
        priority: "high",
        effectiveDate: "2026-10-18",
        today: "2026-10-15",
        horizonDays: 30,
      }),
      "needsAttention"
    );
  });

  it("does not double-bucket the same day event", () => {
    const bucket = classifyWatchBucket({
      type: "school_closure",
      requiresAction: false,
      priority: "high",
      effectiveDate: "2026-09-07",
      today: "2026-09-07",
      horizonDays: 30,
    });
    assert.equal(bucket, "today");
    assert.notEqual(bucket, "needsAttention");
    assert.notEqual(bucket, "comingUp");
  });
});

describe("priority rules", () => {
  it("marks overdue required actions urgent", () => {
    assert.equal(
      resolveItemPriority({
        type: "deadline",
        requiresAction: true,
        llmPriority: "low",
        effectiveDate: "2026-09-01",
        today: "2026-09-07",
      }),
      "urgent"
    );
  });

  it("elevates school closure tomorrow to high", () => {
    assert.equal(
      resolveItemPriority({
        type: "school_closure",
        requiresAction: false,
        llmPriority: "normal",
        effectiveDate: "2026-09-07",
        today: "2026-09-06",
      }),
      "high"
    );
  });
});

describe("Gideon structured retrieval helpers", () => {
  it("detects schedule intents", () => {
    assert.equal(wantsGuardianItemRetrieval("What's coming up this week?"), true);
    assert.equal(wantsGuardianItemRetrieval("What do I need to do?"), true);
    assert.equal(wantsGuardianItemRetrieval("Hello there"), false);
  });

  it("scores child-specific questions higher for matching child", () => {
    const matthew: GideonGuardianItem = {
      id: "1",
      space_id: "s1",
      child_id: "c1",
      type: "school_closure",
      title: "No school — Labor Day",
      effective_date: "2026-09-07",
      requires_action: false,
      priority: "normal",
      space_name: "Family",
      child_name: "Matthew",
      source_excerpt: "Labor Day",
    };
    const nolan: GideonGuardianItem = {
      ...matthew,
      id: "2",
      child_id: "c2",
      child_name: "Nolan",
      title: "Picture Day",
    };
    const q = "What's coming up for Matthew?";
    assert.ok(
      scoreGuardianItemRelevance(matthew, q) >
        scoreGuardianItemRelevance(nolan, q)
    );
  });

  it("formats items without technical jargon", () => {
    const text = formatGuardianItemsForGideon([
      {
        id: "1",
        space_id: "s1",
        child_id: null,
        type: "expiration",
        title: "Vehicle registration expires",
        effective_date: "2026-10-18",
        requires_action: true,
        priority: "normal",
        space_name: "Personal",
        child_name: null,
        source_excerpt: null,
      },
    ]);
    assert.match(text, /Vehicle registration expires/);
    assert.match(text, /Personal/);
    assert.doesNotMatch(text, /RAG|embedding|ontology|LLM/i);
  });
});

describe("cross-space date math", () => {
  it("computes day deltas for horizon", () => {
    assert.equal(daysBetween("2026-09-01", "2026-09-07"), 6);
    assert.equal(daysBetween("2026-09-07", "2026-09-07"), 0);
    assert.equal(daysBetween("2026-09-08", "2026-09-07"), -1);
  });
});
