/**
 * Pure My World → Gideon formatting helpers (no DB / server-only).
 */

import type { WorldEntityDetail } from "./apiTypes";

const WORLD_QUERY =
  /\b(what(?:'s| is) going on with|tell me about|who is|what do (?:you|we) know about|status (?:of|on)|update on)\b/i;

export function wantsWorldEntityRetrieval(question: string): boolean {
  return WORLD_QUERY.test(question.trim());
}

/** Extract a likely entity name phrase from common question shapes. */
export function extractWorldEntityQueryName(question: string): string | null {
  const q = question.trim();
  const patterns = [
    /what(?:'s| is) going on with\s+(.+?)(?:\?|$)/i,
    /tell me about\s+(.+?)(?:\?|$)/i,
    /who is\s+(.+?)(?:\?|$)/i,
    /what do (?:you|we) know about\s+(.+?)(?:\?|$)/i,
    /(?:status|update) (?:of|on)\s+(.+?)(?:\?|$)/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m?.[1]?.trim()) {
      return m[1].trim().replace(/[?.!]+$/, "").trim();
    }
  }
  return null;
}

/**
 * Compact consumer-facing block for Gideon's system prompt.
 * Caps size intentionally — targeted retrieval only.
 */
export function formatWorldEntityForGideon(detail: WorldEntityDetail): string {
  const lines: string[] = [];
  lines.push(`Name: ${detail.entity.name} (${detail.entity.typeLabel})`);
  if (detail.description) {
    lines.push(`Summary: ${detail.description.slice(0, 400)}`);
  }
  if (detail.relationshipToUser) {
    lines.push(`Connection to you: ${detail.relationshipToUser}`);
  }

  if (detail.relatedPeople.length) {
    lines.push(
      `Related people: ${detail.relatedPeople
        .slice(0, 6)
        .map((p) => p.name)
        .join(", ")}`
    );
  }
  if (detail.relatedOrganizations.length) {
    lines.push(
      `Related organizations: ${detail.relatedOrganizations
        .slice(0, 6)
        .map((o) => o.name)
        .join(", ")}`
    );
  }

  const facts = detail.facts.slice(0, 8);
  if (facts.length) {
    lines.push("Important facts:");
    for (const f of facts) {
      const value =
        f.valueText ??
        (f.valueNumber != null ? String(f.valueNumber) : null) ??
        f.valueDate ??
        "—";
      lines.push(`- ${f.predicate.replace(/_/g, " ")}: ${value}`);
    }
  }

  if (detail.timeline.length) {
    lines.push("Recent timeline:");
    for (const t of detail.timeline.slice(0, 5)) {
      lines.push(
        `- ${t.title}${t.summary ? ` — ${t.summary.slice(0, 120)}` : ""}`
      );
    }
  }

  if (detail.attention.length) {
    lines.push("Needs attention:");
    for (const a of detail.attention.slice(0, 4)) {
      lines.push(`- ${a.title}`);
    }
  }

  if (detail.evidence.length) {
    lines.push("Why Guardian believes this (cite when answering):");
    for (const e of detail.evidence.slice(0, 4)) {
      const title = e.sourceTitle ?? e.sourceType;
      const excerpt = e.sourceExcerpt
        ? ` "${e.sourceExcerpt.slice(0, 160)}"`
        : "";
      lines.push(`- ${title}${excerpt}`);
    }
  }

  lines.push(
    "Answer from this My World context first. Do not invent missing facts. Prefer plain language (people, organizations, connections) — never say ontology, vectors, or semantic graph."
  );

  return lines.join("\n");
}
