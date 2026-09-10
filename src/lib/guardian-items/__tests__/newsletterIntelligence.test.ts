import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { associateGuardianItem } from "../associate";
import {
  buildDedupeKey,
  buildLogicalFingerprint,
} from "../dedupe";
import { classifyWatchBucket } from "../dates";
import {
  classifySchoolNewsletter,
  extractSchoolNewsletterItems,
  formatSchoolDayAnswer,
  shouldSurfaceSchoolItemInToday,
  buildNewsletterReviewSummary,
  formatReviewCountLines,
  wantsSchoolStructuredAnswer,
} from "../newsletter";
import { classificationFromFileName } from "@/lib/analysis/filenameHints";
import { calendarDateInUserZone } from "@/lib/timezone";
import {
  NOLAN_AUG31_NEWSLETTER,
  NOLAN_CHILD,
} from "./fixtures/nolanNewsletter";

describe("school newsletter classification", () => {
  it("recognizes classroom newsletter signals", () => {
    const result = classifySchoolNewsletter({
      sourceText: NOLAN_AUG31_NEWSLETTER,
      title: "Classroom Newsletter",
      fileName: "aug31-newsletter.jpg",
    });
    assert.equal(result.isSchoolNewsletter, true);
    assert.ok(result.confidence >= 0.45);
    assert.equal(result.documentType, "school_newsletter");
    assert.ok(result.reasons.some((r) => /newsletter|homework|word list/i.test(r)));
  });

  it("classifies from filename hints", () => {
    const hint = classificationFromFileName("classroom-newsletter-aug31.pdf");
    assert.equal(hint?.document_type, "school_newsletter");
  });

  it("does not classify unrelated invoices", () => {
    const result = classifySchoolNewsletter({
      sourceText: "Invoice #441 Amount due $120",
      fileName: "invoice.pdf",
    });
    assert.equal(result.isSchoolNewsletter, false);
  });
});

describe("school newsletter extraction", () => {
  const extracted = extractSchoolNewsletterItems({
    sourceText: NOLAN_AUG31_NEWSLETTER,
    childReference: "Nolan",
    today: "2026-09-09",
  });

  it("extracts publication date and homework week", () => {
    assert.equal(extracted.meta.publicationDate, "2026-08-31");
    assert.equal(extracted.meta.homeworkWeekStart, "2026-09-07");
  });

  it("extracts full-date events including Labor Day no school", () => {
    const labor = extracted.items.find(
      (i) => i.type === "no_school" && i.event_date === "2026-09-07"
    );
    assert.ok(labor);
    assert.match(labor!.title, /labor day/i);
  });

  it("extracts event times for Back-to-School Night", () => {
    const night = extracted.items.find((i) =>
      /back-to-school night/i.test(i.title)
    );
    assert.ok(night);
    assert.equal(night!.event_date, "2026-09-10");
    assert.ok(night!.start_at);
    assert.ok(night!.end_at);
    assert.equal(night!.metadata?.time_label, "7:00–9:00 PM");
  });

  it("extracts early dismissal / half-day pickup", () => {
    const half = extracted.items.find((i) => i.type === "early_dismissal");
    assert.ok(half);
    assert.equal(half!.event_date, "2026-09-25");
    assert.ok(half!.start_at);
  });

  it("resolves weekday homework to absolute dates", () => {
    const mon = extracted.items.find(
      (i) => i.type === "homework" && i.event_date === "2026-09-07"
    );
    const tue = extracted.items.find(
      (i) => i.type === "homework" && i.event_date === "2026-09-08"
    );
    assert.ok(mon);
    assert.ok(tue);
    assert.match(mon!.title, /math page 2/i);
  });

  it("creates explicit no_homework records", () => {
    const wed = extracted.items.find(
      (i) => i.type === "no_homework" && i.event_date === "2026-09-09"
    );
    const fri = extracted.items.find(
      (i) => i.type === "no_homework" && i.event_date === "2026-09-11"
    );
    assert.ok(wed, "Wednesday no homework required");
    assert.ok(fri);
  });

  it("creates Thursday study reminder", () => {
    const study = extracted.items.find(
      (i) => i.type === "study_reminder" && i.event_date === "2026-09-10"
    );
    assert.ok(study);
    assert.match(study!.title, /spelling test/i);
  });

  it("extracts spelling list with individual words in metadata", () => {
    const list = extracted.items.find((i) => i.type === "spelling_list");
    assert.ok(list);
    const words = list!.metadata?.spelling_words as string[];
    assert.equal(words.length, 15);
    assert.ok(words.includes("because"));
    assert.ok(words.includes("write"));
  });

  it("extracts teacher contact", () => {
    assert.ok(extracted.meta.teacherName);
    const contact = extracted.items.find((i) => i.type === "school_contact");
    assert.ok(contact);
  });
});

describe("child association (never invent)", () => {
  it("associates when uploading into a child Space", () => {
    const result = associateGuardianItem(
      {
        userId: "u1",
        spaceId: NOLAN_CHILD.id,
        spaceProfileType: "child",
        spaceDisplayName: "Nolan",
        childSpaces: [NOLAN_CHILD],
      },
      null
    );
    assert.equal(result.childId, NOLAN_CHILD.id);
  });

  it("associates from explicit child_reference when unique", () => {
    const result = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "family",
        spaceProfileType: "family",
        childSpaces: [
          NOLAN_CHILD,
          { id: "child-ava", display_name: "Ava" },
        ],
      },
      "Nolan"
    );
    assert.equal(result.childId, NOLAN_CHILD.id);
  });

  it("does not guess when multiple children and no reference", () => {
    const result = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "family",
        spaceProfileType: "family",
        childSpaces: [
          NOLAN_CHILD,
          { id: "child-ava", display_name: "Ava" },
        ],
      },
      null
    );
    assert.equal(result.childId, null);
  });

  it("isolates multi-child references", () => {
    const result = associateGuardianItem(
      {
        userId: "u1",
        spaceId: "family",
        spaceProfileType: "family",
        childSpaces: [
          NOLAN_CHILD,
          { id: "child-ava", display_name: "Ava" },
        ],
      },
      "Ava"
    );
    assert.equal(result.childId, "child-ava");
    assert.notEqual(result.childId, NOLAN_CHILD.id);
  });
});

describe("Guardian Today school filtering", () => {
  const today = "2026-09-09";

  it("surfaces no homework today and tomorrow prep", () => {
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "no_homework",
        eventDate: "2026-09-09",
        today,
      }),
      true
    );
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "school_event",
        eventDate: "2026-09-10",
        today,
      }),
      true
    );
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "study_reminder",
        eventDate: "2026-09-10",
        today,
      }),
      true
    );
  });

  it("hides past homework, completed, and full spelling lists", () => {
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "homework",
        eventDate: "2026-09-07",
        today,
      }),
      false
    );
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "homework",
        eventDate: "2026-09-08",
        today,
        status: "completed",
      }),
      false
    );
    assert.equal(
      shouldSurfaceSchoolItemInToday({
        type: "spelling_list",
        eventDate: "2026-09-11",
        today,
      }),
      false
    );
  });

  it("buckets no_homework as today", () => {
    assert.equal(
      classifyWatchBucket({
        type: "no_homework",
        requiresAction: false,
        priority: "normal",
        effectiveDate: "2026-09-09",
        today: "2026-09-09",
        horizonDays: 30,
      }),
      "today"
    );
  });
});

describe("timezone-aware today", () => {
  it("uses America/New_York calendar day not UTC midnight", () => {
    // 2026-09-10 03:30 UTC is still Sept 9 evening in New York
    const instant = new Date("2026-09-10T03:30:00.000Z");
    const et = calendarDateInUserZone(instant, "America/New_York");
    assert.equal(et, "2026-09-09");
    const utc = calendarDateInUserZone(instant, "UTC");
    assert.equal(utc, "2026-09-10");
  });
});

describe("dedupe and supersession fingerprints", () => {
  it("builds stable document-local dedupe keys", () => {
    const a = buildDedupeKey({
      type: "no_homework",
      title: "No homework (Wednesday)",
      effectiveDate: "2026-09-09",
      childId: "child-nolan",
      sourceDocumentId: "doc-1",
    });
    const b = buildDedupeKey({
      type: "no_homework",
      title: "No homework (Wednesday)",
      effectiveDate: "2026-09-09",
      childId: "child-nolan",
      sourceDocumentId: "doc-1",
    });
    assert.equal(a, b);
  });

  it("logical fingerprint ignores source document for supersession", () => {
    const a = buildLogicalFingerprint({
      type: "school_event",
      title: "Back-to-School Night",
      effectiveDate: "2026-09-10",
      childId: "child-nolan",
    });
    const b = buildLogicalFingerprint({
      type: "school_event",
      title: "Back-to-School Night",
      effectiveDate: "2026-09-10",
      childId: "child-nolan",
    });
    assert.equal(a, b);
    assert.doesNotMatch(a, /doc-/);
  });
});

describe("low-confidence confirmation flow", () => {
  it("flags review when child is unknown", () => {
    const extracted = extractSchoolNewsletterItems({
      sourceText: NOLAN_AUG31_NEWSLETTER,
      today: "2026-09-09",
    });
    const summary = buildNewsletterReviewSummary({
      items: extracted.items,
      meta: extracted.meta,
      childName: null,
      childId: null,
    });
    assert.equal(summary.needsChildConfirmation, true);
    assert.match(summary.headline, /confirm which child/i);
    const lines = formatReviewCountLines(summary.counts);
    assert.ok(lines.some((l) => /homework/i.test(l)));
    assert.ok(lines.some((l) => /spelling/i.test(l)));
  });

  it("shows Added to Nolan's school world when child known", () => {
    const extracted = extractSchoolNewsletterItems({
      sourceText: NOLAN_AUG31_NEWSLETTER,
      today: "2026-09-09",
    });
    const summary = buildNewsletterReviewSummary({
      items: extracted.items,
      meta: extracted.meta,
      childName: "Nolan",
      childId: NOLAN_CHILD.id,
    });
    assert.equal(summary.needsChildConfirmation, false);
    assert.equal(summary.headline, "Added to Nolan's school world");
  });
});

describe("Gideon school answer priority (acceptance)", () => {
  it("answers What does Nolan have today? from structured items", () => {
    assert.equal(
      wantsSchoolStructuredAnswer("What does Nolan have today?"),
      true
    );

    const extracted = extractSchoolNewsletterItems({
      sourceText: NOLAN_AUG31_NEWSLETTER,
      childReference: "Nolan",
      today: "2026-09-09",
    });

    const items = extracted.items.map((item, i) => ({
      id: `item-${i}`,
      type: item.type,
      title: item.title,
      description: item.description,
      event_date: item.event_date ?? null,
      start_at: item.start_at ?? null,
      end_at: item.end_at ?? null,
      status: "active",
      child_name: "Nolan",
      source_document_id: "doc-newsletter",
      source_excerpt: item.source_excerpt,
      metadata: item.metadata ?? null,
    }));

    // Include a completed past assignment that must be ignored
    items.push({
      id: "old",
      type: "homework",
      title: "Math worksheet page 1",
      description: "Old assignment",
      event_date: "2026-09-01",
      start_at: null,
      end_at: null,
      status: "completed",
      child_name: "Nolan",
      source_document_id: "doc-old",
      source_excerpt: "Math worksheet",
      metadata: { newsletter: true },
    });

    const result = formatSchoolDayAnswer({
      question: "What does Nolan have today?",
      childName: "Nolan",
      today: "2026-09-09",
      items,
    });

    assert.ok(result);
    assert.equal(
      result!.answer,
      "Nolan has no homework today. Tomorrow is Back-to-School Night from 7:00–9:00 PM, and he should study for his spelling test."
    );
    assert.deepEqual(result!.citationDocumentIds, ["doc-newsletter"]);
  });

  it("returns spelling words when asked", () => {
    const extracted = extractSchoolNewsletterItems({
      sourceText: NOLAN_AUG31_NEWSLETTER,
      today: "2026-09-09",
    });
    const list = extracted.items.find((i) => i.type === "spelling_list")!;
    const result = formatSchoolDayAnswer({
      question: "Show Nolan's spelling words.",
      childName: "Nolan",
      today: "2026-09-09",
      items: [
        {
          type: list.type,
          title: list.title,
          description: list.description,
          event_date: list.event_date ?? null,
          status: "active",
          source_document_id: "doc-newsletter",
          metadata: list.metadata ?? null,
        },
      ],
    });
    assert.ok(result);
    assert.match(result!.answer, /because/i);
    assert.match(result!.answer, /write/i);
  });
});

describe("membership / authorization isolation notes", () => {
  it("keeps associate scoped to provided childSpaces only", () => {
    const outsider = associateGuardianItem(
      {
        userId: "family-a",
        spaceId: "family-a",
        spaceProfileType: "family",
        childSpaces: [NOLAN_CHILD],
      },
      "SomeoneElse"
    );
    assert.equal(outsider.childId, null);
  });
});
