/**
 * Document-grounding helpers for Ask Gideon.
 * Prefer Space filings (Form ADV / CRS / disclosure PDFs) over marketing copy.
 */

/** Questions that must be answered from Space documents when available. */
export function isDocumentContentQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return (
    /\b(fee|fees|compensation|how .{0,20}make money|billing|minimum (account|fee)|aum|assets under management)\b/i.test(
      q
    ) ||
    /\b(form\s+adv|form\s+crs|part\s+2a|item\s+5|disclosure brochure|firm brochure)\b/i.test(
      q
    ) ||
    /\b(what services (are |does |do )?(described|offered|listed)|services (described|offered|listed)|conflicts? of interest)\b/i.test(
      q
    ) ||
    /\b(what does (this|the) (say|document|brochure|form) (about|say))\b/i.test(q)
  );
}

/** File names that are regulatory / disclosure sources for advisory firms. */
export function isRegulatoryDisclosureFileName(fileName: string): boolean {
  const n = fileName.trim().toLowerCase();
  if (!n) return false;
  return (
    /\bform\s*adv\b/.test(n) ||
    /\bform\s*crs\b/.test(n) ||
    /\bpart\s*2a\b/.test(n) ||
    /\bdisclosure\b/.test(n) ||
    /\bbrochure\b/.test(n) ||
    /\bcrs\b/.test(n) ||
    /1026427/.test(n) // common IAPD brochure id pattern in filenames
  );
}

/** Expand fee/disclosure questions so hybrid search prefers filings over marketing pages. */
export function expandDocumentContentRetrievalQuery(question: string): string {
  if (!isDocumentContentQuestion(question)) return question;
  return `${question.trim()} Form ADV Part 2A Item 5 fee schedule Form CRS disclosure brochure`;
}

/**
 * Drop "missing document" gaps when that document is actually present
 * among Space file labels (inventory / uploads).
 */
export function filterUnavailableGapsAgainstSpaceDocs(
  gaps: string[],
  availableDocumentLabels: string[]
): string[] {
  if (!gaps.length || !availableDocumentLabels.length) return gaps;
  return gaps.filter((gap) => {
    const m = gap.match(
      /Available sources reference (.+?), but that document does not appear to be available/i
    );
    if (!m?.[1]) return true;
    const mentioned = m[1].trim();
    const key = mentioned
      .toLowerCase()
      .replace(/\.(pdf|docx?|txt|md)$/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (key.length < 3) return true;
    return !availableDocumentLabels.some((label) => {
      const avail = label
        .toLowerCase()
        .replace(/\.(pdf|docx?|txt|md)$/i, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      return (
        avail.includes(key) ||
        key.includes(avail) ||
        (key.length >= 8 && avail.includes(key.slice(0, 8)))
      );
    });
  });
}
