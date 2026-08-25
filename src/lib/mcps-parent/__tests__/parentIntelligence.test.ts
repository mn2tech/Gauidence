import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PARENT_DASHBOARD_MAX_ITEMS,
  RELEVANCE_WEIGHTS,
  addDays,
  buildIcs,
  buildSuggestedQuestions,
  daysBetween,
  formatParentDate,
  gradesMatch,
  humanizeKnowledgeTitle,
  isExpired,
  rankWhatMatters,
  schoolsMatch,
  scoreKnowledgeItem,
  toYmd,
  type ScoreableKnowledge,
} from "@/lib/mcps-parent";

function item(
  partial: Partial<ScoreableKnowledge> & Pick<ScoreableKnowledge, "id" | "title">
): ScoreableKnowledge {
  return {
    content: partial.content ?? partial.title,
    category: partial.category ?? "calendar",
    school: partial.school ?? null,
    grade_level: partial.grade_level ?? null,
    authority: partial.authority ?? "Montgomery County Public Schools",
    source_url: partial.source_url ?? "https://www.montgomeryschoolsmd.org/",
    effective_date: partial.effective_date ?? null,
    expires_at: partial.expires_at ?? null,
    status: partial.status ?? "published",
    source_name: partial.source_name ?? "MCPS",
    last_checked_at: partial.last_checked_at ?? new Date().toISOString(),
    ...partial,
  };
}

const asOf = new Date(2026, 8, 10); // Sep 10, 2026

describe("MCPS parent school filtering", () => {
  it("excludes events for other schools", () => {
    const scored = scoreKnowledgeItem(
      item({
        id: "1",
        title: "Churchill early release",
        content: "Early release at Winston Churchill High School",
        school: "Winston Churchill High School",
        effective_date: "2026-09-11",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.equal(scored, null);
  });

  it("includes exact school matches", () => {
    const scored = scoreKnowledgeItem(
      item({
        id: "2",
        title: "Sherwood parent night",
        content: "Parent event at Sherwood High School",
        school: "Sherwood High School",
        effective_date: "2026-09-12",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.ok(scored);
    assert.ok(scored!.score >= RELEVANCE_WEIGHTS.exactSchoolMatch);
    assert.ok(scored!.reasons.includes("Applies to your school"));
  });

  it("includes district-wide closures for every parent", () => {
    const scored = scoreKnowledgeItem(
      item({
        id: "3",
        title: "Labor Day — Schools and offices closed",
        content: "No school. Schools and offices closed.",
        school: null,
        effective_date: "2026-09-11",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.ok(scored);
    assert.ok(scored!.reasons.includes("District-wide"));
  });
});

describe("date ranking", () => {
  it("ranks tomorrow higher than 20 days from now", () => {
    const tomorrow = toYmd(addDays(asOf, 1));
    const later = toYmd(addDays(asOf, 20));
    const ranked = rankWhatMatters(
      [
        item({
          id: "far",
          title: "Far event",
          content: "School event",
          effective_date: later,
        }),
        item({
          id: "near",
          title: "Tomorrow early release",
          content: "Early release tomorrow",
          effective_date: tomorrow,
        }),
      ],
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.ok(ranked.length >= 2);
    assert.equal(ranked[0]!.id, "near");
    assert.ok(ranked[0]!.score > ranked[1]!.score);
  });
});

describe("expired information", () => {
  it("never displays expired items", () => {
    assert.equal(isExpired("2026-09-01", asOf), true);
    const scored = scoreKnowledgeItem(
      item({
        id: "old",
        title: "Old deadline",
        content: "Deadline passed",
        expires_at: "2026-09-01",
        effective_date: "2026-09-15",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.equal(scored, null);
  });
});

describe("grade relevance", () => {
  it("prioritizes exact grade matches", () => {
    assert.equal(gradesMatch("9", "Grade 9"), true);
    assert.equal(gradesMatch("9", "9th"), true);
    const withGrade = scoreKnowledgeItem(
      item({
        id: "g9",
        title: "Grade 9 orientation",
        content: "Parent action required for Grade 9",
        grade_level: "9",
        effective_date: "2026-09-12",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    const without = scoreKnowledgeItem(
      item({
        id: "g11",
        title: "General parent info",
        content: "Evergreen parent guidance page about the district",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.ok(withGrade);
    assert.ok((withGrade?.score ?? 0) > (without?.score ?? 0));
  });
});

describe("dashboard item limit", () => {
  it("returns at most ~3–5 top items", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item({
        id: `i${i}`,
        title: `No school day ${i}`,
        content: "No school for students",
        effective_date: toYmd(addDays(asOf, i + 1)),
      })
    );
    const ranked = rankWhatMatters(many, {
      schoolName: "Sherwood High School",
      gradeLevel: "9",
      asOf,
    });
    assert.ok(ranked.length <= PARENT_DASHBOARD_MAX_ITEMS);
    assert.equal(PARENT_DASHBOARD_MAX_ITEMS, 5);
  });
});

describe("Gideon context helpers", () => {
  it("suggested questions do not hard-code school names", () => {
    const qs = buildSuggestedQuestions({
      hasSchool: true,
      topItems: [
        {
          id: "1",
          title: "Early release",
          summary: "Early release",
          category: "calendar",
          school: "Sherwood High School",
          grade_level: null,
          authority: "MCPS",
          source_url: null,
          source_name: "Calendar",
          event_date: "2026-09-11",
          effective_date: null,
          expires_at: null,
          last_checked_at: null,
          score: 100,
          reasons: ["Early release"],
          importance_tags: ["early_release"],
          stale: false,
        },
      ],
    });
    assert.ok(qs.includes("What do I need to know this week?"));
    for (const q of qs) {
      assert.doesNotMatch(q, /Sherwood/i);
    }
  });

  it("school name matching is fuzzy enough for High School suffixes", () => {
    assert.equal(
      schoolsMatch("Sherwood High School", "Sherwood High"),
      true
    );
  });
});

describe("calendar ics", () => {
  it("builds an all-day ICS payload with source URL", () => {
    const ics = buildIcs({
      title: "Early Release",
      startDate: "2026-09-16",
      schoolName: "Sherwood High School",
      sourceUrl: "https://www.montgomeryschoolsmd.org/calendar",
    });
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /DTSTART;VALUE=DATE:20260916/);
    assert.match(ics, /Early Release/);
  });
});

describe("evergreen demotion + title cleanup", () => {
  it("keeps dated calendar cards and drops undated transport how-to pages from top ranks", () => {
    const ranked = rankWhatMatters(
      [
        item({
          id: "cal",
          title:
            "2026–2027 School Calendar+ Montgomery County Public Schools 2026 July 3 Independence Day—Schools and offices closed Augu",
          content:
            "September 7 Labor Day—Schools and offices closed. Early release day for students on September 18.",
          category: "calendar",
        }),
        item({
          id: "bus1",
          title: "Transportation (Buses) - Montgomery County Public Schools",
          content:
            "Division of Transportation Services provides bus routes. Contact your depot for questions about your student's bus route.",
          category: "transportation",
        }),
        item({
          id: "bus2",
          title: "About Riding the School Bus",
          content:
            "Parents are responsible for children at the bus stop. Elementary students living more than one mile may ride the bus.",
          category: "transportation",
        }),
      ],
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    assert.ok(ranked.every((r) => r.id === "cal" || r.event_date));
    assert.ok(!ranked.some((r) => r.id === "bus1" || r.id === "bus2"));
  });

  it("humanizes dump titles into short parent-facing labels", () => {
    const title = humanizeKnowledgeTitle({
      title:
        "2026–2027 School Calendar+ Montgomery County Public Schools 2026 July 3 Independence Day",
      content: "September 18 Early release day for students",
      tags: ["early_release"],
    });
    assert.equal(title, "Early release");
  });

  it("does not treat ParentVUE evergreen pages as dated Coming Up events", () => {
    const scored = scoreKnowledgeItem(
      item({
        id: "pv",
        title: "ParentVUE",
        content:
          "Activate ParentVUE by September 1 using the activation letter. ParentVUE lets parents view grades and attendance.",
        category: "parent-resources",
      }),
      { schoolName: "Sherwood High School", gradeLevel: "9", asOf }
    );
    // May be null (evergreen drop) or unscored without event_date — never a Coming Up date.
    assert.ok(!scored || !scored.event_date);
  });

  it("formats parent dates for display", () => {
    assert.match(formatParentDate("2026-08-25"), /Aug/);
    assert.doesNotMatch(formatParentDate("2026-08-25"), /2026-08-25/);
  });
});

describe("daysBetween sanity", () => {
  it("computes day deltas", () => {
    assert.equal(daysBetween(asOf, addDays(asOf, 1)), 1);
  });
});
