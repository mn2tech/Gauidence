import type { Fact, ExtractedFact, GuardianAnalysis } from "./types";
import { CONFIDENCE_MEDIUM, mapSourceType } from "./types";
import { formatDateRelativeLabel } from "./dates";

function shouldShow(fact: ExtractedFact): boolean {
  if (fact.needs_verification || fact.confidence < CONFIDENCE_MEDIUM) {
    // Show with verification flag rather than omit entirely when we have a value
    return Boolean(fact.value?.trim());
  }
  return Boolean(fact.value?.trim());
}

function toDisplayFact(
  fact: ExtractedFact,
  timeZone?: string,
  now = new Date()
): Fact | null {
  if (!shouldShow(fact)) return null;

  let value = fact.value;
  let label = fact.label;

  if (fact.date && /^\d{4}-\d{2}-\d{2}$/.test(fact.date)) {
    if (fact.is_past_event) {
      value = formatDateRelativeLabel(fact.date, "past_event", now, timeZone);
    } else if (fact.is_deadline) {
      value = formatDateRelativeLabel(fact.date, "deadline", now, timeZone);
    }
  }

  if (fact.needs_verification || fact.confidence < CONFIDENCE_MEDIUM) {
    label = `${label} (Needs verification)`;
  }

  return {
    label,
    value,
    source: mapSourceType(fact.source_type),
    date: fact.date ?? null,
    confidence: fact.confidence,
    needs_verification: fact.needs_verification || fact.confidence < CONFIDENCE_MEDIUM,
    source_excerpt: fact.source_excerpt || undefined,
    page_number: fact.page_number,
  };
}

/** Flatten rich analysis into dashboard Fact[] (facts, dates, suggestions separate). */
export function toDisplayFacts(
  analysis: GuardianAnalysis,
  timeZone?: string
): Fact[] {
  const out: Fact[] = [];
  const now = new Date();

  for (const f of analysis.facts) {
    const d = toDisplayFact(f, timeZone, now);
    if (d) out.push(d);
  }
  for (const f of analysis.important_dates) {
    const d = toDisplayFact(f, timeZone, now);
    if (d) out.push(d);
  }
  for (const f of analysis.amounts) {
    const d = toDisplayFact(f, timeZone, now);
    if (d) out.push(d);
  }
  for (const action of analysis.suggested_actions) {
    out.push({
      label: "Suggestion",
      value: action,
      source: "ai_generated",
      date: null,
    });
  }
  for (const warning of analysis.warnings) {
    out.push({
      label: "Warning",
      value: warning,
      source: "calculated",
      date: null,
      needs_verification: true,
    });
  }

  return out;
}

export function collectDeadlines(
  analysis: GuardianAnalysis,
  fileName: string
): { title: string; due_date: string }[] {
  if (analysis.guardian_status === "needs_verification") return [];
  if (analysis.overall_confidence < CONFIDENCE_MEDIUM) return [];

  const deadlines: { title: string; due_date: string }[] = [];
  const seen = new Set<string>();

  for (const f of [...analysis.important_dates, ...analysis.facts]) {
    if (!f.is_deadline || !f.date) continue;
    if (f.needs_verification || f.confidence < CONFIDENCE_MEDIUM) continue;
    if (seen.has(f.date + f.label)) continue;
    seen.add(f.date + f.label);
    deadlines.push({ title: `${fileName}: ${f.label}`, due_date: f.date });
  }
  return deadlines;
}
