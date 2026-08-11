/** Normalize entity names for resolution and deduplication. */

const SUFFIX_PATTERNS: [RegExp, string][] = [
  [/\bllc\.?\b/gi, "llc"],
  [/\binc\.?\b/gi, "inc"],
  [/\bcorp\.?\b/gi, "corp"],
  [/\bltd\.?\b/gi, "ltd"],
  [/\bco\.?\b/gi, "co"],
  [/\bllp\.?\b/gi, "llp"],
  [/\bplc\.?\b/gi, "plc"],
];

/**
 * Normalize an entity name for matching.
 * Preserves the original display name separately in the database.
 */
export function normalizeEntityName(name: string): string {
  let normalized = name.trim().toLowerCase();

  for (const [pattern, replacement] of SUFFIX_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[.,'"()&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

/** Levenshtein distance for conservative fuzzy matching. */
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

/** Similarity ratio 0–1 based on Levenshtein distance. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeEntityName(a);
  const nb = normalizeEntityName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

/** Whether fuzzy matching is safe for this entity type. */
export function isFuzzyMatchAllowed(entityType: string): boolean {
  return entityType === "organization" || entityType === "project";
}

/** Common person names should not auto-merge via fuzzy match. */
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
