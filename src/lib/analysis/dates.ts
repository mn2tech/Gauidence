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

export function formatDisplayDate(
  isoDate: string,
  timeZone: string = GUARDIAN_TIME_ZONE
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
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
