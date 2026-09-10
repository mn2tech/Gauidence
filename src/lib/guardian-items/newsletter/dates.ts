/**
 * Date helpers for school newsletter extraction (pure).
 * Resolves abbreviated weekdays using publication / week context.
 */

import { addCalendarDays } from "../dates";

const MONTHS: Record<string, string> = {
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

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function parseLooseNewsletterDate(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const long =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i.exec(
      t
    );
  if (!long) return null;
  const month = MONTHS[long[1]!.toLowerCase()];
  const day = String(Number(long[2])).padStart(2, "0");
  const year = long[3] ?? null;
  if (!month || !year) return null;
  return `${year}-${month}-${day}`;
}

/** Extract publication / header date near the top of the newsletter. */
export function extractPublicationDate(sourceText: string): string | null {
  const head = sourceText.slice(0, 1_500);
  const weekOf =
    /\bweek\s+of\s+((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?)/i.exec(
      head
    );
  if (weekOf?.[1]) {
    const d = parseLooseNewsletterDate(weekOf[1]);
    if (d) return d;
  }

  const dated =
    /\b((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*20\d{2})\b/i.exec(
      head
    );
  if (dated?.[1]) return parseLooseNewsletterDate(dated[1]);

  return null;
}

export function mondayOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay(); // 0=Sun
  const delta = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(isoDate, delta);
}

export function dateForWeekdayInWeek(
  weekStartMonday: string,
  weekday: string
): string | null {
  const idx = WEEKDAY_INDEX[weekday.trim().toLowerCase()];
  if (idx == null || idx < 1 || idx > 5) return null;
  // Monday=1 → offset 0
  return addCalendarDays(weekStartMonday, idx - 1);
}

/**
 * Choose homework week Monday from publication date + full event dates.
 * Prefer the Monday of the earliest upcoming event on/after publication.
 */
export function resolveHomeworkWeekStart(args: {
  publicationDate: string | null;
  eventDates: string[];
  today?: string | null;
}): string | null {
  const pub = args.publicationDate;
  const upcoming = [...args.eventDates]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter((d) => !pub || d >= pub)
    .sort();

  if (upcoming[0]) return mondayOfWeek(upcoming[0]!);

  if (pub) {
    // Newsletter dated on a Monday often covers the following school week
    // when no dated events exist yet — use that Monday or next Monday.
    const pubMonday = mondayOfWeek(pub);
    if (pub === pubMonday) return pubMonday;
    return addCalendarDays(pubMonday, 7);
  }

  if (args.today) return mondayOfWeek(args.today);
  return null;
}

export type ParsedTimeRange = {
  startAt: string | null;
  endAt: string | null;
  label: string | null;
};

/** Parse "7:00–9:00 PM" or "12:00 PM" into timestamptz strings for a date. */
export function parseEventTimesOnDate(
  date: string,
  raw: string
): ParsedTimeRange {
  const text = raw.replace(/\u00a0/g, " ");
  const range =
    /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.exec(
      text
    );
  if (range) {
    const endMeridiem = range[6]!.toLowerCase().replace(/\./g, "");
    const startMeridiem = (range[3] ?? range[6]!)
      .toLowerCase()
      .replace(/\./g, "");
    const start = toIsoOnDate(date, Number(range[1]), Number(range[2] ?? 0), startMeridiem);
    const end = toIsoOnDate(date, Number(range[4]), Number(range[5] ?? 0), endMeridiem);
    return {
      startAt: start,
      endAt: end,
      label: `${hour12Label(Number(range[1]), Number(range[2] ?? 0))}–${formatClock(Number(range[4]), Number(range[5] ?? 0), endMeridiem)}`,
    };
  }

  const single =
    /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.exec(text);
  if (single) {
    const mer = single[3]!.toLowerCase().replace(/\./g, "");
    const start = toIsoOnDate(date, Number(single[1]), Number(single[2] ?? 0), mer);
    return {
      startAt: start,
      endAt: null,
      label: formatClock(Number(single[1]), Number(single[2] ?? 0), mer),
    };
  }

  return { startAt: null, endAt: null, label: null };
}

function toIsoOnDate(
  date: string,
  hour12: number,
  minute: number,
  meridiem: string
): string {
  let hour = hour12 % 12;
  if (meridiem.startsWith("p")) hour += 12;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  // Store as noon-anchored local wall-clock without inventing a zone —
  // callers attach user zone when displaying. Use Z suffix as absolute marker
  // for the civil time on that calendar day (matches existing due_at pattern).
  return `${date}T${hh}:${mm}:00.000Z`;
}

function formatClock(hour12: number, minute: number, meridiem: string): string {
  const mer = meridiem.startsWith("p") ? "PM" : "AM";
  const mm = String(minute).padStart(2, "0");
  return minute === 0 ? `${hour12}:00 ${mer}` : `${hour12}:${mm} ${mer}`;
}

function hour12Label(hour12: number, minute: number): string {
  const mm = String(minute).padStart(2, "0");
  return minute === 0 ? `${hour12}:00` : `${hour12}:${mm}`;
}

export function formatTimeRangeLabel(
  startAt: string | null,
  endAt: string | null
): string | null {
  if (!startAt) return null;
  const sParts = /T(\d{2}):(\d{2})/.exec(startAt);
  if (!sParts) return null;
  let sh = Number(sParts[1]);
  const smin = Number(sParts[2]);
  const sMer = sh >= 12 ? "PM" : "AM";
  if (sh === 0) sh = 12;
  else if (sh > 12) sh -= 12;
  const sLabel =
    smin === 0 ? `${sh}:00` : `${sh}:${String(smin).padStart(2, "0")}`;

  if (!endAt) return `${sLabel} ${sMer}`;
  const eParts = /T(\d{2}):(\d{2})/.exec(endAt);
  if (!eParts) return `${sLabel} ${sMer}`;
  let eh = Number(eParts[1]);
  const emin = Number(eParts[2]);
  const eMer = eh >= 12 ? "PM" : "AM";
  if (eh === 0) eh = 12;
  else if (eh > 12) eh -= 12;
  const eLabel =
    emin === 0 ? `${eh}:00` : `${eh}:${String(emin).padStart(2, "0")}`;
  if (sMer === eMer) return `${sLabel}–${eLabel} ${eMer}`;
  return `${sLabel} ${sMer}–${eLabel} ${eMer}`;
}
