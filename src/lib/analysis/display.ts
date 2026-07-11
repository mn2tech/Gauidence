import type { Fact, ExtractedFact, GuardianAnalysis } from "./types";
import { CONFIDENCE_MEDIUM, mapSourceType } from "./types";
import { formatDateRelativeLabel } from "./dates";
import { buildInvoiceCanonicalFacts } from "./invoiceDisplay";

function shouldShow(fact: ExtractedFact): boolean {
  if (fact.needs_verification || fact.confidence < CONFIDENCE_MEDIUM) {
    return Boolean(fact.value?.trim());
  }
  return Boolean(fact.value?.trim());
}

function canonicalKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s*\(needs verification\)\s*/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
    if (!/\(needs verification\)/i.test(label)) {
      label = `${label} (Needs verification)`;
    }
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

function dedupeFacts(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const f of facts) {
    const key = canonicalKey(f.label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** Flatten rich analysis into dashboard Fact[] (facts, dates, suggestions separate). */
export function toDisplayFacts(
  analysis: GuardianAnalysis,
  timeZone?: string
): Fact[] {
  const now = new Date();
  const out: Fact[] = [];

  // Invoices: specialist fields are canonical — avoid duplicates from generic arrays.
  const sourceFacts: ExtractedFact[] =
    analysis.document_type === "invoice"
      ? buildInvoiceCanonicalFacts(analysis.specialist)
      : [
          ...analysis.facts,
          ...analysis.important_dates,
          ...analysis.amounts,
        ];

  for (const f of sourceFacts) {
    const d = toDisplayFact(f, timeZone, now);
    if (d) out.push(d);
  }

  const deduped = dedupeFacts(out);

  for (const action of analysis.suggested_actions) {
    deduped.push({
      label: "Suggestion",
      value: action,
      source: "ai_generated",
      date: null,
    });
  }
  // Deduplicate identical warning messages
  const seenWarnings = new Set<string>();
  for (const warning of analysis.warnings) {
    if (seenWarnings.has(warning)) continue;
    seenWarnings.add(warning);
    deduped.push({
      label: "Warning",
      value: warning,
      source: "calculated",
      date: null,
      needs_verification: true,
    });
  }

  return deduped;
}

export function collectDeadlines(
  analysis: GuardianAnalysis,
  fileName: string
): { title: string; due_date: string }[] {
  if (analysis.guardian_status === "needs_verification") return [];
  if (analysis.overall_confidence < CONFIDENCE_MEDIUM) return [];

  const deadlines: { title: string; due_date: string }[] = [];
  const seen = new Set<string>();

  const dateFacts =
    analysis.document_type === "invoice"
      ? buildInvoiceCanonicalFacts(analysis.specialist)
      : [...analysis.important_dates, ...analysis.facts];

  for (const f of dateFacts) {
    if (!f.is_deadline || !f.date) continue;
    if (f.needs_verification || f.confidence < CONFIDENCE_MEDIUM) continue;
    if (seen.has(f.date + f.label)) continue;
    seen.add(f.date + f.label);
    deadlines.push({ title: `${fileName}: ${f.label}`, due_date: f.date });
  }
  return deadlines;
}
