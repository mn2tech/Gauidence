/** Normalize names, money, and dates for the Semantic Layer. */

const ORG_SUFFIXES = /\b(llc|inc|corp|ltd|co|llp|plc|pllc|pc)\.?\b/gi;

export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(ORG_SUFFIXES, " ")
    .replace(/[.,'"()&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Org key without legal suffixes for suffix-insensitive matching. */
export function canonicalizeOrganizationKey(name: string): string {
  return normalizeEntityName(name)
    .replace(/\b(llc|inc|corp|ltd|co|llp|plc|pllc|pc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

export function isFuzzyMatchAllowed(entityType: string): boolean {
  return (
    entityType === "organization" ||
    entityType === "agency" ||
    entityType === "opportunity" ||
    entityType === "contract" ||
    entityType === "project" ||
    entityType === "product" ||
    entityType === "school" ||
    entityType === "location"
  );
}

/** Do not auto-merge ambiguous people sharing a first name only. */
export function isAmbiguousPersonName(name: string): boolean {
  const parts = normalizeEntityName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return true;
  const commonFirst = new Set([
    "john",
    "jane",
    "michael",
    "david",
    "james",
    "robert",
    "mary",
    "jennifer",
    "chris",
    "alex",
  ]);
  return commonFirst.has(parts[0]!);
}

/** Parse dollar amounts like "$60,000" or "60000 dollars" → number. */
export function normalizeDollarAmount(raw: string | number): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/usd|dollars?/gi, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize date-like strings to ISO when parseable.
 * Returns null when ambiguous.
 */
export function normalizeDateValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function truncateExcerpt(text: string, max = 500): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}
