import type { GuardianExtractedItem } from "./schema";

export type AnalysisImportantDate = {
  label?: string;
  date?: string | null;
  value?: string;
  is_past_event?: boolean;
  is_deadline?: boolean;
};

function parseLooseDate(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const months: Record<string, string> = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sept: "09",
    sep: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  const long =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–—-]\s*\d{1,2}(?:st|nd|rd|th)?)?,?\s*(20\d{2})\b/i.exec(
      t
    );
  if (!long) return null;
  const month = months[long[1]!.toLowerCase()];
  const day = String(Number(long[2])).padStart(2, "0");
  const year = long[3];
  if (!month || !year) return null;
  return `${year}-${month}-${day}`;
}

function resolveDate(fact: AnalysisImportantDate): string | null {
  const direct = (fact.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return parseLooseDate(fact.value || fact.label || "");
}

/**
 * Deterministic Watch items from analysis important_dates — no LLM required.
 * Used so chat image uploads (summits, appointments) hit Today even if the
 * extraction model returns nothing.
 */
export function guardianItemsFromImportantDates(args: {
  dates: AnalysisImportantDate[] | null | undefined;
  title?: string | null;
  summary?: string | null;
  today: string;
}): GuardianExtractedItem[] {
  const dates = args.dates ?? [];
  const items: GuardianExtractedItem[] = [];
  const seen = new Set<string>();

  for (const fact of dates) {
    const date = resolveDate(fact);
    if (!date) continue;
    // Trust the calendar day over a stale is_past_event flag from vision.
    if (date < args.today) continue;

    const label = (fact.label || fact.value || "").trim() || "Upcoming date";
    const key = `${date}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isDeadline = Boolean(fact.is_deadline);
    const title =
      args.title?.trim() &&
      !/^(image|screenshot|photo|untitled)/i.test(args.title.trim())
        ? args.title.trim().slice(0, 300)
        : label.slice(0, 300);

    const excerpt = [label, date, args.summary?.trim().slice(0, 200)]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 500);

    items.push({
      type: isDeadline ? "deadline" : "event",
      title,
      description: args.summary?.trim().slice(0, 1000) || label,
      event_date: isDeadline ? null : date,
      due_at: isDeadline ? date : null,
      requires_action: isDeadline,
      priority: isDeadline ? "high" : "normal",
      child_reference: null,
      confidence: 0.92,
      source_excerpt: excerpt || `${label}: ${date}`,
    });
  }

  return items.slice(0, 10);
}

/**
 * Fallback: pull future YYYY-MM-DD / Month Day, Year mentions from OCR text
 * when important_dates were empty or mis-tagged.
 */
export function guardianItemsFromSourceText(args: {
  sourceText: string;
  title?: string | null;
  summary?: string | null;
  today: string;
}): GuardianExtractedItem[] {
  const text = args.sourceText.slice(0, 8_000);
  const found = new Set<string>();

  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    found.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of text.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–—-]\s*\d{1,2}(?:st|nd|rd|th)?)?,?\s*(20\d{2})\b/gi
  )) {
    const parsed = parseLooseDate(m[0]!);
    if (parsed) found.add(parsed);
  }

  return guardianItemsFromImportantDates({
    dates: [...found].map((date) => ({
      label: "Event date",
      date,
      is_past_event: false,
      is_deadline: false,
    })),
    title: args.title,
    summary: args.summary,
    today: args.today,
  });
}
