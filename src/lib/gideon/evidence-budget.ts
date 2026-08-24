/**
 * Rank and budget retrieval evidence before final generation.
 * Avoids dumping every retrieved chunk into the LLM prompt.
 */

import type { RetrievalEvidence } from "./orchestration-types";

/** Reasonable evidence budget for final generation. */
export const MAX_DIRECT_EVIDENCE = 5;

function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .slice(0, 240);
}

/**
 * Rank by score, drop near-duplicates and weak matches, cap at budget.
 */
export function budgetRetrievalEvidence(
  evidence: RetrievalEvidence[],
  max: number = MAX_DIRECT_EVIDENCE
): RetrievalEvidence[] {
  if (!evidence.length) return [];
  const sorted = [...evidence].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: RetrievalEvidence[] = [];
  for (const item of sorted) {
    if (item.score < 0.05 && out.length > 0) continue;
    const key = normalizeForDedupe(item.text);
    if (!key || seen.has(key)) continue;
    let dup = false;
    for (const prev of seen) {
      if (prev.includes(key.slice(0, 80)) || key.includes(prev.slice(0, 80))) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
