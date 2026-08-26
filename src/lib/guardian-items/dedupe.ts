import type { GuardianItemType } from "./types";

/** Collapse punctuation/whitespace and lowercase for stable matching. */
export function normalizeTitle(title: string): string {
  let n = title
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const holiday =
    n.match(
      /\b(labor day|memorial day|thanksgiving|christmas|new year(?:s)? day|presidents day|martin luther king(?: jr)? day|veterans day|columbus day|juneteenth)\b/
    )?.[0] ?? null;

  if (
    holiday &&
    /\b(school|schools|closed|closure|no school|offices)\b/.test(n)
  ) {
    return `school closed ${holiday}`;
  }

  n = n
    .replace(/\b(no school|schools? closed|school closed)\b/g, "school closed")
    .replace(/\s+/g, " ")
    .trim();

  return n;
}

export function buildDedupeKey(args: {
  type: GuardianItemType;
  title: string;
  effectiveDate: string | null;
  childId: string | null;
  sourceDocumentId: string | null;
}): string {
  const parts = [
    args.type,
    normalizeTitle(args.title),
    args.effectiveDate ?? "nodate",
    args.childId ?? "nochild",
    args.sourceDocumentId ?? "nosource",
  ];
  return parts.join("|").slice(0, 500);
}

/**
 * Titles that refer to the same school closure / holiday should normalize
 * similarly when date + source match.
 */
export function titlesLikelySameEvent(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const tokensA = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tokensB = nb.split(" ").filter((t) => t.length >= 3);
  if (tokensA.size === 0 || tokensB.length === 0) return false;
  const overlap = tokensB.filter((t) => tokensA.has(t)).length;
  return overlap >= Math.min(2, tokensB.length);
}
