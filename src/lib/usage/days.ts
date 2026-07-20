import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

function calendarDateInZone(
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

export function weekdayLabel(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!y || !m || !d) return dateYmd;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Last 7 calendar days in Guardian TZ, oldest → newest. */
export function lastSevenDayKeys(now = new Date()): string[] {
  const today = calendarDateInZone(now);
  const [y, mo, d] = today.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.UTC(y!, mo! - 1, d! - i, 12));
    keys.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt)
    );
  }
  return keys;
}

export function eventCalendarDay(iso: string): string {
  return calendarDateInZone(new Date(iso));
}
