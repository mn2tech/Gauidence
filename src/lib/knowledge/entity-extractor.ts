import type { KnowledgeEntityPreview } from "./types";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const MONEY_RE = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi;
const ORG_SUFFIX_RE =
  /\b[A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)*\s+(?:Inc\.?|LLC|L\.L\.C\.?|Corp\.?|Corporation|Co\.?|Company|Ltd\.?)\b/g;
const PROPER_NAME_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueByNormalized(
  items: KnowledgeEntityPreview[]
): KnowledgeEntityPreview[] {
  const seen = new Set<string>();
  const out: KnowledgeEntityPreview[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.normalizedName ?? normalizeName(item.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function collectMatches(
  content: string,
  pattern: RegExp,
  type: string,
  confidence: number
): KnowledgeEntityPreview[] {
  const matches = content.match(pattern) ?? [];
  return matches.map((name) => ({
    type,
    name: name.trim(),
    normalizedName: normalizeName(name),
    confidence,
  }));
}

/** Deterministic entity extraction for shadow-mode previews. */
export function extractEntities(content: string): KnowledgeEntityPreview[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const entities: KnowledgeEntityPreview[] = [
    ...collectMatches(trimmed, EMAIL_RE, "email", 0.95),
    ...collectMatches(trimmed, PHONE_RE, "phone", 0.85),
    ...collectMatches(trimmed, MONEY_RE, "amount", 0.9),
    ...collectMatches(trimmed, DATE_RE, "date", 0.8),
    ...collectMatches(trimmed, ORG_SUFFIX_RE, "organization", 0.75),
    ...collectMatches(trimmed, PROPER_NAME_RE, "person", 0.6),
  ];

  return uniqueByNormalized(entities).slice(0, 40);
}
