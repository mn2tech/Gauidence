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

const MONTH_WORD =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec";

export type TimesheetHoursQuery = {
  kind: "employee_month";
  employeeName: string;
  startDate: string;
  endDate: string;
  label: string;
};

export type TimesheetPeriodQuery = {
  kind: "period_summary";
  startDate: string;
  endDate: string;
  label: string;
  expectedHours: number;
};

export type TimesheetRemoteQuery = TimesheetHoursQuery | TimesheetPeriodQuery;

const DEFAULT_EXPECTED_HOURS = 80;

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

function formatRangeLabel(startDate: string, endDate: string): string {
  return `${startDate} through ${endDate}`;
}

function parseExpectedHours(raw: string): number {
  const m = raw.match(
    /\b(?:expected|against|vs\.?|versus)\s+(\d+(?:\.\d+)?)\s*hours?\b/i
  );
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const env = Number(process.env.TIMESHEET_EXPECTED_HOURS);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_EXPECTED_HOURS;
}

/** "June 21 through July 4 2026" / "between June 21 and July 4, 2026" */
function parseExplicitDateRange(
  raw: string
): { startDate: string; endDate: string; label: string } | null {
  const through = raw.match(
    new RegExp(
      `\\b(?:from|between)?\\s*(${MONTH_WORD})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:through|thru|to|and|[-–])\\s*(${MONTH_WORD})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s*(\\d{4})\\b`,
      "i"
    )
  );
  if (through) {
    const m1 = MONTHS[through[1]!.toLowerCase()];
    const d1 = parseInt(through[2]!, 10);
    const m2 = MONTHS[through[3]!.toLowerCase()];
    const d2 = parseInt(through[4]!, 10);
    const year = parseInt(through[5]!, 10);
    if (!m1 || !m2 || !year) return null;
    const startDate = `${year}-${pad(m1)}-${pad(d1)}`;
    const endDate = `${year}-${pad(m2)}-${pad(d2)}`;
    return { startDate, endDate, label: formatRangeLabel(startDate, endDate) };
  }

  const iso = raw.match(
    /\b(?:from|between)\s+(\d{4}-\d{2}-\d{2})\s+(?:through|thru|to|and)\s+(\d{4}-\d{2}-\d{2})\b/i
  );
  if (iso) {
    return {
      startDate: iso[1]!,
      endDate: iso[2]!,
      label: formatRangeLabel(iso[1]!, iso[2]!),
    };
  }

  return null;
}

function looksLikePeriodSummary(q: string): boolean {
  if (
    /\b(all employees|everyone|team|staff|payroll period|pay period|timesheet (report|summary)|hours (report|summary)|who (exceeded|matched|worked)|variance)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(hours?|timesheet)\b/i.test(q) &&
    /\b(through|thru|between|from)\b/i.test(q) &&
    !/\b(did|has)\s+\w+/i.test(q)
  ) {
    return true;
  }
  return false;
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
  if (/\btimesheet\b/.test(q) && /\b(hours?|for|report|summary)\b/.test(q)) {
    return true;
  }
  if (looksLikePeriodSummary(q) && /\b(hours?|timesheet|exceeded|variance)\b/.test(q)) {
    return true;
  }
  return false;
}

/**
 * Parse employee-month or pay-period summary questions.
 */
export function parseTimesheetRemoteQuery(
  question: string
): TimesheetRemoteQuery | null {
  const raw = question.trim();
  if (!raw || !wantsTimesheetHoursQuery(raw)) return null;

  const explicit = parseExplicitDateRange(raw);
  if (explicit && looksLikePeriodSummary(raw.toLowerCase())) {
    return {
      kind: "period_summary",
      startDate: explicit.startDate,
      endDate: explicit.endDate,
      label: explicit.label,
      expectedHours: parseExpectedHours(raw),
    };
  }

  // Explicit range with a named employee → treat as employee period (reuse month shape).
  if (explicit) {
    const namePatterns = [
      /(?:how many|total)?\s*hours?\s+(?:did|has)\s+(.+?)\s+work/i,
      /(?:did|has)\s+(.+?)\s+work(?:ed)?/i,
      /hours?\s+(?:for|of)\s+(.+?)(?:\s+(?:from|between|in|for|during)\s+)/i,
    ];
    for (const pattern of namePatterns) {
      const m = raw.match(pattern);
      const candidate = m?.[1]?.trim();
      if (!candidate) continue;
      const cleaned = candidate.replace(/\s+/g, " ").trim();
      if (cleaned.length >= 2) {
        return {
          kind: "employee_month",
          employeeName: cleaned,
          startDate: explicit.startDate,
          endDate: explicit.endDate,
          label: explicit.label,
        };
      }
    }
    // No name → period summary for the whole team.
    return {
      kind: "period_summary",
      startDate: explicit.startDate,
      endDate: explicit.endDate,
      label: explicit.label,
      expectedHours: parseExpectedHours(raw),
    };
  }

  const monthYear =
    raw.match(
      new RegExp(
        `\\b(?:in|for|during)\\s+(${MONTH_WORD})\\.?\\s+(\\d{4})\\b`,
        "i"
      )
    ) ??
    raw.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i
    );

  if (!monthYear) return null;

  const month = MONTHS[monthYear[1]!.toLowerCase()];
  const year = parseInt(monthYear[2]!, 10);
  if (!month || !Number.isFinite(year)) return null;

  const range = monthRange(year, month);

  if (looksLikePeriodSummary(raw.toLowerCase())) {
    return {
      kind: "period_summary",
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
      expectedHours: parseExpectedHours(raw),
    };
  }

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
    kind: "employee_month",
    employeeName,
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
  };
}

/** @deprecated Prefer parseTimesheetRemoteQuery */
export function parseTimesheetHoursQuery(
  question: string
): TimesheetHoursQuery | null {
  const parsed = parseTimesheetRemoteQuery(question);
  if (!parsed || parsed.kind !== "employee_month") return null;
  return parsed;
}
