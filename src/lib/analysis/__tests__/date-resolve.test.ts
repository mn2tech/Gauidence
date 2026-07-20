import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveExtractedIsoDate,
  resolveMonthDayToNearTerm,
  sanitizeFactDate,
  sanitizeAnalysisDates,
} from "../dateResolve.ts";
import type { ExtractedFact, GuardianAnalysis } from "../types.ts";
import { toDisplayFacts } from "../display.ts";
import { validateAnalysis } from "../validate.ts";

const NOW = new Date("2026-07-20T16:00:00Z"); // afternoon ET ≈ Jul 20
const TZ = "America/New_York";

function fact(partial: Partial<ExtractedFact>): ExtractedFact {
  return {
    label: "Date",
    value: "July 20, 2020",
    source_type: "document",
    confidence: 0.9,
    source_excerpt: "Monday, July 20",
    page_number: null,
    needs_verification: false,
    date: "2020-07-20",
    is_deadline: false,
    is_past_event: true,
    ...partial,
  };
}

describe("dateResolve", () => {
  it("keeps year when grounded in excerpt", () => {
    const { date, yearInferred } = resolveExtractedIsoDate(
      "2024-07-20",
      "Invoice Date: July 20, 2024",
      NOW,
      TZ
    );
    assert.equal(date, "2024-07-20");
    assert.equal(yearInferred, false);
  });

  it("uses document year when model invents a different year", () => {
    const { date, yearInferred } = resolveExtractedIsoDate(
      "2020-07-20",
      "Signed July 20, 2024",
      NOW,
      TZ
    );
    assert.equal(date, "2024-07-20");
    assert.equal(yearInferred, true);
  });

  it("re-anchors month/day with no year to current year near-term", () => {
    assert.equal(resolveMonthDayToNearTerm(7, 20, NOW, TZ), "2026-07-20");
    assert.equal(resolveMonthDayToNearTerm(7, 24, NOW, TZ), "2026-07-24");
    const { date, yearInferred } = resolveExtractedIsoDate(
      "2020-07-20",
      "Monday, July 20",
      NOW,
      TZ
    );
    assert.equal(date, "2026-07-20");
    assert.equal(yearInferred, true);
  });

  it("sanitizes GovCon-style past_event facts into near-term deadlines", () => {
    const next = sanitizeFactDate(
      fact({
        label: "Monday Training",
        source_excerpt: "Monday, July 20",
        date: "2020-07-19",
        is_past_event: true,
        is_deadline: false,
      }),
      NOW,
      TZ
    );
    assert.equal(next.date, "2026-07-19");
    assert.equal(next.is_past_event, true); // 1 day before "today" Jul 20 ET
    assert.equal(next.is_deadline, false);
    assert.equal(next.needs_verification, true);
    assert.equal(next.source_type, "calculated");
  });

  it("marks upcoming re-anchored dates as deadlines", () => {
    const next = sanitizeFactDate(
      fact({
        label: "Friday Training",
        source_excerpt: "Friday, July 24",
        date: "2020-07-24",
        value: "July 24, 2020",
        is_past_event: true,
      }),
      NOW,
      TZ
    );
    assert.equal(next.date, "2026-07-24");
    assert.equal(next.is_deadline, true);
    assert.equal(next.is_past_event, false);
    assert.match(next.value, /2026/);
  });

  it("display no longer shows thousands of days ago after validate", () => {
    const analysis: GuardianAnalysis = {
      document_type: "general",
      title: "GovCon Live",
      summary: "Schedule",
      facts: [],
      important_dates: [
        fact({
          label: "Tuesday Training",
          source_excerpt: "Tuesday, July 21",
          date: "2020-07-21",
          value: "July 21, 2020",
          is_past_event: true,
          is_deadline: false,
        }),
      ],
      people: [],
      organizations: [],
      amounts: [],
      obligations: [],
      warnings: [],
      guardian_status: "protected",
      suggested_actions: [],
      overall_confidence: 0.9,
      specialist: {},
    };

    const validated = validateAnalysis(analysis, NOW);
    const display = toDisplayFacts(validated, TZ);
    const row = display.find((f) => /Tuesday Training/i.test(f.label));
    assert.ok(row);
    assert.match(row!.value, /2026/);
    assert.doesNotMatch(row!.value, /days ago/);
    assert.match(row!.value, /remaining|today|due/);
  });

  it("adds a verification warning when years are inferred", () => {
    const out = sanitizeAnalysisDates(
      {
        document_type: "general",
        title: "t",
        summary: "s",
        facts: [],
        important_dates: [
          fact({ source_excerpt: "July 22", date: "2020-07-22" }),
        ],
        people: [],
        organizations: [],
        amounts: [],
        obligations: [],
        warnings: [],
        guardian_status: "protected",
        suggested_actions: [],
        overall_confidence: 0.9,
        specialist: {},
      },
      NOW,
      TZ
    );
    assert.ok(out.warnings.some((w) => /inferred/i.test(w)));
  });
});
