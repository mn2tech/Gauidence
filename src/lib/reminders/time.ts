import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

/** Calendar YYYY-MM-DD in Guardian's product timezone. */
export function calendarDateInZone(
  instant: Date,
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Build a timestamptz from a local calendar date + HH:mm in a named zone.
 * Returns null if inputs are invalid.
 */
export function zonedDateTimeToIso(args: {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timeZone?: string;
}): string | null {
  const timeZone = args.timeZone ?? GUARDIAN_TIME_ZONE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return null;
  if (!/^\d{2}:\d{2}$/.test(args.time)) return null;

  // Interpret wall time in the zone via a format-and-search approach:
  // iterate a UTC guess until the zoned parts match.
  const [y, mo, d] = args.date.split("-").map(Number);
  const [hh, mm] = args.time.split(":").map(Number);
  if (
    !y ||
    !mo ||
    !d ||
    hh == null ||
    mm == null ||
    hh > 23 ||
    mm > 59
  ) {
    return null;
  }

  // Start from noon UTC on that calendar day as a seed, then refine.
  let guess = Date.UTC(y, mo - 1, d, hh, mm, 0);

  for (let i = 0; i < 8; i++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0
    );
    const target = Date.UTC(y, mo - 1, d, hh, mm, 0);
    const delta = target - asUtc;
    if (delta === 0) {
      return new Date(guess).toISOString();
    }
    guess += delta;
  }

  return new Date(guess).toISOString();
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

export function formatReminderWhen(
  dueAt: string | null | undefined,
  dueDate: string,
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  if (dueAt) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(dueAt));
    } catch {
      /* fall through */
    }
  }
  try {
    const [y, m, d] = dueDate.split("-").map(Number);
    if (y && m && d) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(Date.UTC(y, m - 1, d, 12)));
    }
  } catch {
    /* ignore */
  }
  return dueDate;
}
