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

/**
 * Title key that ignores clock times / calendar fluff so "repair at 2pm"
 * and "repair at 3pm" match for attention reschedules.
 */
export function titleMatchKey(title: string): string {
  return normalizeTitle(title)
    .replace(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/g, " ")
    .replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, " ")
    .replace(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?\b/g,
      " "
    )
    .replace(/\b(at|@|on|for|by|tomorrow|today|tonight)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/** Same attention topic after a reschedule (time/date change). */
export function titlesLikelySameAttention(a: string, b: string): boolean {
  const ka = titleMatchKey(a);
  const kb = titleMatchKey(b);
  if (ka && kb) {
    if (ka === kb) return true;
    if (ka.length >= 8 && kb.length >= 8 && (ka.includes(kb) || kb.includes(ka))) {
      return true;
    }
    const tokensA = new Set(ka.split(" ").filter((t) => t.length >= 3));
    const tokensB = kb.split(" ").filter((t) => t.length >= 3);
    if (tokensA.size > 0 && tokensB.length > 0) {
      const overlap = tokensB.filter((t) => tokensA.has(t)).length;
      if (overlap >= Math.min(2, tokensB.length, tokensA.size)) return true;
    }
  }
  return titlesLikelySameEvent(a, b);
}
