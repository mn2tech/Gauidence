/** Aggressive normalization for entity deduplication. */
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co)\b\.?/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePredicate(predicate: string): string {
  return predicate.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeFactValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function factDedupKey(args: {
  subject: string;
  predicate: string;
  objectValue?: string | null;
  effectiveDate?: string | null;
}): string {
  return [
    normalizeEntityName(args.subject),
    normalizePredicate(args.predicate),
    normalizeFactValue(args.objectValue ?? ""),
    args.effectiveDate ?? "",
  ].join("|");
}
