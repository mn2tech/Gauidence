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

export type TimesheetHoursQuery = {
  employeeName: string;
  startDate: string;
  endDate: string;
  label: string;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRange(
  year: number,
  month: number
): { startDate: string; endDate: string; label: string } {
  const endDay = lastDayOfMonth(year, month);
  const label = `${MONTH_LABELS[month - 1] ?? pad(month)} ${year}`;
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(endDay)}`,
    label,
  };
}

/** Detect English timesheet / hours questions suitable for the remote DB. */
export function wantsTimesheetHoursQuery(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (!q) return false;
  if (
    /\b(how many|total|sum)\b/.test(q) &&
    /\bhours?\b/.test(q) &&
    /\b(work|worked|did|for)\b/.test(q)
  ) {
    return true;
  }
  if (/\bhours?\b/.test(q) && /\b(in|for)\b/.test(q) && /\b(20\d{2})\b/.test(q)) {
    return true;
  }
  if (/\btimesheet\b/.test(q) && /\b(hours?|for)\b/.test(q)) {
    return true;
  }
  return false;
}

/**
 * Parse "How many hours did Frank Damico work in May 2026?" style questions.
 */
export function parseTimesheetHoursQuery(
  question: string
): TimesheetHoursQuery | null {
  const raw = question.trim();
  if (!raw || !wantsTimesheetHoursQuery(raw)) return null;

  const monthYear =
    raw.match(
      /\b(?:in|for|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{4})\b/i
    ) ??
    raw.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i
    );

  if (!monthYear) return null;

  const month = MONTHS[monthYear[1]!.toLowerCase()];
  const year = parseInt(monthYear[2]!, 10);
  if (!month || !Number.isFinite(year)) return null;

  const range = monthRange(year, month);

  const namePatterns = [
    /(?:how many|total)?\s*hours?\s+(?:did|has)\s+(.+?)\s+work/i,
    /(?:did|has)\s+(.+?)\s+work(?:ed)?/i,
    /hours?\s+(?:for|of)\s+(.+?)(?:\s+(?:in|for|during)\s+)/i,
    /timesheet\s+(?:for\s+)?(.+?)(?:\s+(?:in|for|during)\s+)/i,
    /^(.+?)\s+hours?\s+(?:in|for|during)\s+/i,
  ];

  let employeeName: string | undefined;
  for (const pattern of namePatterns) {
    const m = raw.match(pattern);
    const candidate = m?.[1]?.trim();
    if (!candidate) continue;
    const cleaned = candidate
      .replace(/^(the\s+)?(employee|worker|contractor)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (
      cleaned.length >= 2 &&
      !/^(how|many|total|sum|hours?)$/i.test(cleaned)
    ) {
      employeeName = cleaned;
      break;
    }
  }

  if (!employeeName) return null;

  return {
    employeeName,
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
  };
}
