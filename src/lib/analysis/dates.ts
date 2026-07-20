/** Date display helpers for Guardian analysis (past vs countdown). */

import { GUARDIAN_TIME_ZONE } from "../timezone";

export function daysRelativeTo(
  isoDate: string,
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): number {
  const today = startOfDayInZone(now, timeZone);
  const target = parseIsoDateAsUtcMidnight(isoDate);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Format a calendar ISO date (YYYY-MM-DD) for display.
 * Uses noon UTC + UTC zone so US Eastern (and similar) do not shift the
 * civil day back when midnight UTC is still the previous local evening.
 * `timeZone` is accepted for API compatibility but does not change the day.
 */
export function formatDisplayDate(
  isoDate: string,
  _timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Past events: "July 1, 2026 — 10 days ago"
 * Future action dates: "July 31, 2026 — 20 days remaining"
 * Never "Invoice date — time remaining"
 */
export function formatDateRelativeLabel(
  isoDate: string,
  kind: "past_event" | "deadline",
  now = new Date(),
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const days = daysRelativeTo(isoDate, now, timeZone);
  const formatted = formatDisplayDate(isoDate, timeZone);

  if (kind === "past_event") {
    if (days === 0) return `${formatted} — today`;
    if (days < 0) {
      const n = Math.abs(days);
      return `${formatted} — ${n} day${n === 1 ? "" : "s"} ago`;
    }
    return `${formatted} — in ${days} day${days === 1 ? "" : "s"}`;
  }

  // deadline / action date
  if (days > 0) return `${formatted} — ${days} day${days === 1 ? "" : "s"} remaining`;
  if (days === 0) return `${formatted} — due today`;
  const n = Math.abs(days);
  return `${formatted} — ${n} day${n === 1 ? "" : "s"} overdue`;
}

function parseIsoDateAsUtcMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function startOfDayInZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(y, m - 1, d));
}
