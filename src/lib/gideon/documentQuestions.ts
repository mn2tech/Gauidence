/**
 * Derive Ask Gideon starter questions from uploaded document metadata.
 * Prefer stored analysis questions; otherwise build from title/type/orgs/summary.
 * No Space-specific hardcoding.
 */

export type DocumentQuestionHint = {
  title?: string | null;
  fileName?: string | null;
  documentType?: string | null;
  summary?: string | null;
  organizations?: string[] | null;
  people?: string[] | null;
  /** From extracted_data.suggested_questions when present. */
  suggestedQuestions?: string[] | null;
};

const MAX_QUESTIONS = 4;
const MAX_WORDS = 10;

function normalizeQuestion(q: string): string {
  const cleaned = q.trim().replace(/\s+/g, " ").replace(/[?]+$/g, "?");
  return cleaned.endsWith("?") ? cleaned : `${cleaned}?`;
}

function wordCount(q: string): number {
  return q.trim().split(/\s+/).filter(Boolean).length;
}

function shortLabel(raw: string, maxWords = 4): string {
  const cleaned = raw
    .replace(/\.(pdf|docx?|txt|md)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return cleaned;
  return parts.slice(0, maxWords).join(" ");
}

function pushUnique(out: string[], seen: Set<string>, candidate: string): void {
  const q = normalizeQuestion(candidate);
  if (!q || wordCount(q) > MAX_WORDS) return;
  const key = q.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(q);
}

function blobFor(doc: DocumentQuestionHint): string {
  return [
    doc.title,
    doc.fileName,
    doc.documentType,
    doc.summary,
    ...(doc.organizations ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Build up to 4 document-grounded Ask Gideon questions for a Space.
 */
export function buildQuestionsFromDocuments(
  docs: DocumentQuestionHint[]
): string[] {
  if (!docs.length) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  // 1) Prefer questions already stored on analyzed documents
  for (const doc of docs) {
    for (const q of doc.suggestedQuestions ?? []) {
      pushUnique(out, seen, q);
      if (out.length >= MAX_QUESTIONS) return out;
    }
  }

  // 2) Organization-centric ("what do we know about X")
  const orgs = [
    ...new Set(
      docs
        .flatMap((d) => d.organizations ?? [])
        .map((o) => o.trim())
        .filter((o) => o.length >= 2)
    ),
  ];
  for (const org of orgs.slice(0, 2)) {
    const label = shortLabel(org, 3);
    pushUnique(out, seen, `What do we know about ${label}?`);
    if (out.length >= MAX_QUESTIONS) return out;
  }

  // 3) Theme questions from title / type / summary (generic, content-driven)
  const combined = docs.map(blobFor).join(" ");
  if (/\b(fee|fees|compensation|cost)\b/i.test(combined)) {
    pushUnique(out, seen, "What does this say about fees?");
  }
  if (/\b(conflict|conflicts of interest)\b/i.test(combined)) {
    pushUnique(out, seen, "What conflicts are disclosed?");
  }
  if (
    /\b(service|services|planning|portfolio|advisory|invest)\b/i.test(combined)
  ) {
    pushUnique(out, seen, "What services are described?");
  }
  if (/\b(form\s+crs|client relationship summary|form\s+adv)\b/i.test(combined)) {
    pushUnique(out, seen, "What does the Form CRS cover?");
  }
  if (/\b(policy|policies|procedure)\b/i.test(combined)) {
    pushUnique(out, seen, "What does this policy require?");
  }
  if (/\b(contract|agreement|proposal)\b/i.test(combined)) {
    pushUnique(out, seen, "What are the key terms?");
  }
  if (/\b(invoice|receipt|amount|payment)\b/i.test(combined)) {
    pushUnique(out, seen, "What amounts are listed?");
  }

  // 4) Summarize the most recent / primary document
  const primary = docs.find((d) => (d.title || d.fileName || "").trim()) ?? docs[0];
  if (primary) {
    const name = shortLabel(
      (primary.title || primary.fileName || "this document").trim(),
      4
    );
    pushUnique(out, seen, `Summarize ${name}`);
  }

  pushUnique(out, seen, "What information is missing?");

  return out.slice(0, MAX_QUESTIONS);
}

/** Read organizations/people from extracted_data.specialist jsonb. */
export function orgsFromSpecialist(specialist: unknown): string[] {
  if (!specialist || typeof specialist !== "object") return [];
  const row = specialist as Record<string, unknown>;
  const orgs = Array.isArray(row.organizations) ? row.organizations : [];
  return orgs
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o.length >= 2)
    .slice(0, 6);
}

export function peopleFromSpecialist(specialist: unknown): string[] {
  if (!specialist || typeof specialist !== "object") return [];
  const row = specialist as Record<string, unknown>;
  const people = Array.isArray(row.people) ? row.people : [];
  return people
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length >= 2)
    .slice(0, 6);
}

export function parseStoredSuggestedQuestions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof raw === "string") {
    try {
      return parseStoredSuggestedQuestions(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}
