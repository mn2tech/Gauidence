import type { ExtractedFact, GuardianAnalysis, GuardianStatus } from "./types";

export function normalizeFact(raw: Partial<ExtractedFact> | null | undefined): ExtractedFact | null {
  if (!raw || typeof raw.value !== "string" || !raw.value.trim()) return null;
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  return {
    label: String(raw.label ?? "Fact"),
    value: raw.value.trim(),
    source_type:
      raw.source_type === "calculated" ||
      raw.source_type === "ai_suggestion" ||
      raw.source_type === "user_confirmed"
        ? raw.source_type
        : "document",
    confidence,
    source_excerpt: String(raw.source_excerpt ?? ""),
    page_number: typeof raw.page_number === "number" ? raw.page_number : null,
    needs_verification: Boolean(raw.needs_verification) || confidence < 0.75,
    date: raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null,
    is_deadline: Boolean(raw.is_deadline),
    is_past_event: Boolean(raw.is_past_event),
  };
}

export function normalizeFactList(list: unknown): ExtractedFact[] {
  if (!Array.isArray(list)) return [];
  return list.map((f) => normalizeFact(f as Partial<ExtractedFact>)).filter(Boolean) as ExtractedFact[];
}

export function emptyAnalysis(
  document_type: GuardianAnalysis["document_type"],
  partial: Partial<GuardianAnalysis> = {}
): GuardianAnalysis {
  return {
    document_type,
    title: partial.title ?? "",
    summary: partial.summary ?? "",
    facts: partial.facts ?? [],
    important_dates: partial.important_dates ?? [],
    people: partial.people ?? [],
    organizations: partial.organizations ?? [],
    amounts: partial.amounts ?? [],
    obligations: partial.obligations ?? [],
    warnings: partial.warnings ?? [],
    guardian_status: (partial.guardian_status as GuardianStatus) ?? "needs_verification",
    suggested_actions: partial.suggested_actions ?? [],
    overall_confidence: partial.overall_confidence ?? 0,
    specialist: partial.specialist ?? {},
  };
}

export function fromModelBase(
  document_type: GuardianAnalysis["document_type"],
  parsed: Record<string, unknown>,
  specialist: Record<string, unknown>
): GuardianAnalysis {
  return emptyAnalysis(document_type, {
    title: String(parsed.title ?? ""),
    summary: String(parsed.summary ?? ""),
    facts: normalizeFactList(parsed.facts),
    important_dates: normalizeFactList(parsed.important_dates),
    people: Array.isArray(parsed.people) ? parsed.people.map(String) : [],
    organizations: Array.isArray(parsed.organizations)
      ? parsed.organizations.map(String)
      : [],
    amounts: normalizeFactList(parsed.amounts),
    obligations: Array.isArray(parsed.obligations)
      ? parsed.obligations.map(String)
      : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    suggested_actions: Array.isArray(parsed.suggested_actions)
      ? parsed.suggested_actions.map(String)
      : [],
    overall_confidence: Math.max(
      0,
      Math.min(1, Number(parsed.overall_confidence) || 0)
    ),
    specialist,
  });
}
