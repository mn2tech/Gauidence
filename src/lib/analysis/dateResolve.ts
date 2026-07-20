/**
 * Ground / re-anchor extracted calendar dates when the model invents a year
 * that is not present in the document text (e.g. "Monday, July 20" → 2020).
 */

import type { ExtractedFact, GuardianAnalysis } from "./types";
import { daysRelativeTo } from "./dates";
import { GUARDIAN_TIME_ZONE } from "../timezone";

const YEAR_IN_TEXT = /\b((?:19|20)\d{2})\b/g;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function zoneYmd(
  now: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function yearsMentioned(...texts: (string | null | undefined)[]): string[] {
  const blob = texts.filter(Boolean).join("\n");
  const found = new Set<string>();
  for (const m of blob.matchAll(YEAR_IN_TEXT)) {
    found.add(m[1]);
  }
  return [...found];
}

/**
 * Prefer current year for month/day when it is not more than `pastGraceDays`
 * in the past; otherwise use next year (upcoming schedule).
 */
export function resolveMonthDayToNearTerm(
  month: number,
  day: number,
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE,
  pastGraceDays = 45
): string {
  const { year } = zoneYmd(now, timeZone);
  const thisYear = `${year}-${pad2(month)}-${pad2(day)}`;
  const days = daysRelativeTo(thisYear, now, timeZone);
  if (days >= -pastGraceDays) return thisYear;
  return `${year + 1}-${pad2(month)}-${pad2(day)}`;
}

/**
 * If the ISO year's digits appear in the document excerpt, keep the model date.
 * If the excerpt states exactly one other year, prefer that year + model M-D.
 * If no year is grounded in the excerpt, re-anchor M-D to the near-term calendar.
 * Do not trust years only present in model-written value/label strings.
 */
export function resolveExtractedIsoDate(
  isoDate: string,
  sourceExcerpt: string | null | undefined,
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): { date: string; yearInferred: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return { date: isoDate, yearInferred: false };
  }
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  if (!month || !day) return { date: isoDate, yearInferred: false };

  const mentioned = yearsMentioned(sourceExcerpt);
  if (mentioned.includes(year)) {
    return { date: isoDate, yearInferred: false };
  }
  if (mentioned.length === 1) {
    return {
      date: `${mentioned[0]}-${pad2(month)}-${pad2(day)}`,
      yearInferred: true,
    };
  }
  return {
    date: resolveMonthDayToNearTerm(month, day, now, timeZone),
    yearInferred: true,
  };
}

function retagAfterYearFix(
  fact: ExtractedFact,
  date: string,
  yearInferred: boolean,
  now: Date,
  timeZone: string
): ExtractedFact {
  if (!yearInferred && fact.date === date) return fact;

  const days = daysRelativeTo(date, now, timeZone);
  let { is_past_event, is_deadline } = fact;

  if (yearInferred) {
    if (days >= 0) {
      is_past_event = false;
      is_deadline = true;
    } else {
      is_past_event = true;
      is_deadline = false;
    }
  }

  let value = fact.value;
  if (yearInferred) {
    const nextYear = date.slice(0, 4);
    if (/\b(?:19|20)\d{2}\b/.test(value)) {
      value = value.replace(/\b(?:19|20)\d{2}\b/g, nextYear);
    }
  }

  return {
    ...fact,
    date,
    value,
    is_past_event,
    is_deadline,
    needs_verification: fact.needs_verification || yearInferred,
    source_type:
      yearInferred && fact.source_type === "document"
        ? "calculated"
        : fact.source_type,
  };
}

export function sanitizeFactDate(
  fact: ExtractedFact,
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): ExtractedFact {
  if (!fact.date) return fact;
  const { date, yearInferred } = resolveExtractedIsoDate(
    fact.date,
    fact.source_excerpt,
    now,
    timeZone
  );
  return retagAfterYearFix(fact, date, yearInferred, now, timeZone);
}

/** Re-anchor ungrounded years on facts and important_dates. */
export function sanitizeAnalysisDates(
  analysis: GuardianAnalysis,
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): GuardianAnalysis {
  let yearInferred = false;
  const facts = analysis.facts.map((f) => {
    const next = sanitizeFactDate(f, now, timeZone);
    if (next.date !== f.date) yearInferred = true;
    return next;
  });
  const important_dates = analysis.important_dates.map((f) => {
    const next = sanitizeFactDate(f, now, timeZone);
    if (next.date !== f.date) yearInferred = true;
    return next;
  });

  const warnings = [...analysis.warnings];
  if (
    yearInferred &&
    !warnings.some((w) => /year/i.test(w) && /not stated|inferred|assumed/i.test(w))
  ) {
    warnings.push(
      "Some dates had no year in the document; Guardian inferred the nearest relevant year — verify against the original."
    );
  }

  return { ...analysis, facts, important_dates, warnings };
}

/** Shared prompt rules so models stop inventing distant years. */
export function analysisDateRules(
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const { year, month, day } = zoneYmd(now, timeZone);
  const todayIso = `${year}-${pad2(month)}-${pad2(day)}`;
  return `Date rules (today is ${todayIso}, timezone ${timeZone}):
- Output calendar dates as ISO YYYY-MM-DD.
- If the document shows month and day without a year, use ${year} when that date falls within the past ~2 weeks or the next ~2 months; otherwise use the next calendar year for future schedules. Never invent an unrelated past year (for example 2020).
- Upcoming meetings, trainings, webinars, and action deadlines: is_deadline=true, is_past_event=false.
- Historical events that already occurred: is_past_event=true, is_deadline=false.
- If the year is uncertain, set needs_verification=true.`;
}
