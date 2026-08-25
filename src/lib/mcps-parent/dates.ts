/** Pure date / importance helpers for MCPS parent relevance (unit-testable). */

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Extract the next upcoming calendar date from knowledge title/content.
 * Prefers structured effective_date when it is still upcoming.
 */
export function extractEventDate(args: {
  title: string;
  content: string;
  effectiveDate?: string | null;
  asOf: Date;
}): string | null {
  const candidates: Date[] = [];

  const pushIfValid = (d: Date | null) => {
    if (!d || Number.isNaN(d.getTime())) return;
    if (daysBetween(args.asOf, d) >= 0) candidates.push(d);
  };

  pushIfValid(parseYmd(args.effectiveDate ?? null));

  const text = `${args.title}\n${args.content}`;
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    pushIfValid(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  for (const m of text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi
  )) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (month) {
      pushIfValid(new Date(Number(m[3]), month - 1, Number(m[2])));
    }
  }

  for (const m of text.matchAll(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi
  )) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (!month) continue;
    let year = args.asOf.getFullYear();
    let candidate = new Date(year, month - 1, Number(m[2]));
    if (daysBetween(args.asOf, candidate) < -60) {
      year += 1;
      candidate = new Date(year, month - 1, Number(m[2]));
    }
    pushIfValid(candidate);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return toYmd(candidates[0]!);
}

export function detectImportanceTags(text: string): string[] {
  const t = text.toLowerCase();
  const tags: string[] = [];
  if (
    /\b(schools? and offices closed|systemwide closure|school(?:s)? closed|offices closed)\b/.test(
      t
    )
  ) {
    tags.push("school_closure");
  }
  if (
    /\b(no school|non-instructional|professional (development )?day|holiday)\b/.test(
      t
    )
  ) {
    tags.push("no_school");
  }
  if (/\bearly release\b/.test(t)) tags.push("early_release");
  if (/\b(deadline|due date|last day to|register by|registration closes)\b/.test(t)) {
    tags.push("deadline");
  }
  // Only tag true transportation *alerts*, not evergreen how-to pages.
  if (
    /\b(bus|transportation|route)\b/.test(t) &&
    /\b(delay|delayed|cancel|cancelled|canceled|suspension|suspended|running late|alert)\b/.test(
      t
    )
  ) {
    tags.push("transportation");
  }
  if (
    /\b(parent|guardian)\b/.test(t) &&
    /\b(required|must|action|complete|submit|verify)\b/.test(t)
  ) {
    tags.push("parent_action");
  }
  if (/\b(event|meeting|orientation|open house|conference)\b/.test(t)) {
    tags.push("school_event");
  }
  return [...new Set(tags)];
}

export function normalizeSchoolKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(high|middle|elementary)\s+school\b/g, "$1")
    .replace(/\bschool\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function schoolsMatch(
  selected: string,
  itemSchool: string | null | undefined
): boolean {
  if (!itemSchool?.trim()) return false;
  const a = normalizeSchoolKey(selected);
  const b = normalizeSchoolKey(itemSchool);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function gradesMatch(
  selected: string,
  itemGrade: string | null | undefined
): boolean {
  if (!itemGrade?.trim()) return false;
  const a = selected.trim().toLowerCase().replace(/^grade\s+/i, "");
  const b = itemGrade.trim().toLowerCase().replace(/^grade\s+/i, "");
  if (a === b) return true;
  // "9" vs "9th" vs "Grade 9"
  const na = a.replace(/(st|nd|rd|th)$/i, "");
  const nb = b.replace(/(st|nd|rd|th)$/i, "");
  return na === nb;
}

export function isExpired(
  expiresAt: string | null | undefined,
  asOf: Date
): boolean {
  const e = parseYmd(expiresAt ?? null);
  if (!e) return false;
  return daysBetween(asOf, e) < 0;
}

export function greetingForNow(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
