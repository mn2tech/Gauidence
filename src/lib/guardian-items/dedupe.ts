import type { GuardianExtractedItem } from "./schema";
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
 * Cross-document logical fingerprint for newsletter supersession.
 * Omits source_document_id so a newer newsletter can replace an older item.
 */
export function buildLogicalFingerprint(args: {
  type: GuardianItemType;
  title: string;
  effectiveDate: string | null;
  childId: string | null;
}): string {
  return [
    args.type,
    normalizeTitle(args.title),
    args.effectiveDate ?? "nodate",
    args.childId ?? "nochild",
  ]
    .join("|")
    .slice(0, 500);
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

const ACTION_TITLE_RE =
  /\b(respond|reply|submit|sign|pay|renew|confirm|schedule|call|email|send|complete|return|approve|permission|rsvp|register|attend|remind|follow.?up|due|deadline)\b/i;

/** Prefer clearer, actionable titles when collapsing near-duplicates. */
export function extractedItemQualityScore(item: GuardianExtractedItem): number {
  let score = item.confidence * 100;
  if (item.requires_action) score += 40;
  if (item.event_date || item.due_at) score += 15;
  if (ACTION_TITLE_RE.test(item.title)) score += 25;
  if (/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(item.title)) score += 10;
  const len = item.title.length;
  if (len >= 20 && len <= 120) score += 10;
  if (len > 180) score -= 20;
  if (
    item.type === "follow_up" ||
    item.type === "deadline" ||
    item.type === "reminder" ||
    item.type === "document_requirement" ||
    item.type === "payment"
  ) {
    score += 15;
  }
  if (item.type === "informational") score -= 10;
  return score;
}

/**
 * Collapse near-duplicate extracted items from the same document batch.
 * Keeps the higher-quality title and merges missing dates/descriptions.
 */
export function collapseNearDuplicateExtractedItems(
  items: GuardianExtractedItem[]
): GuardianExtractedItem[] {
  const kept: GuardianExtractedItem[] = [];
  for (const item of items) {
    const idx = kept.findIndex((k) =>
      titlesLikelySameAttention(k.title, item.title)
    );
    if (idx === -1) {
      kept.push(item);
      continue;
    }
    const existing = kept[idx]!;
    const preferNew =
      extractedItemQualityScore(item) > extractedItemQualityScore(existing);
    const winner = preferNew ? item : existing;
    const loser = preferNew ? existing : item;
    kept[idx] = {
      ...winner,
      event_date: winner.event_date ?? loser.event_date ?? null,
      due_at: winner.due_at ?? loser.due_at ?? null,
      description: winner.description ?? loser.description ?? null,
      requires_action: winner.requires_action || loser.requires_action,
      confidence: Math.max(winner.confidence, loser.confidence),
    };
  }
  return kept;
}

/**
 * Active sibling ids that are the same attention topic as `primaryTitle`
 * (used when Done/Dismiss should clear paraphrased cards too).
 */
export function selectNearDuplicateSiblingIds(
  primaryTitle: string,
  candidates: { id: string; title: string }[]
): string[] {
  return candidates
    .filter((c) => titlesLikelySameAttention(c.title, primaryTitle))
    .map((c) => c.id);
}
