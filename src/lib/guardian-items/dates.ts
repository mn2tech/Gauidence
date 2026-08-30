import type { GuardianItemPriority, GuardianItemType } from "./types";

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromDate: string, toDate: string): number | null {
  const [y1, m1, d1] = fromDate.split("-").map(Number);
  const [y2, m2, d2] = toDate.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
  const a = Date.UTC(y1, m1 - 1, d1, 12);
  const b = Date.UTC(y2, m2 - 1, d2, 12);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Prefer event_date (date-only) over due_at calendar day in user zone.
 * Never treat date-only as midnight UTC for classification.
 */
export function effectiveCalendarDate(args: {
  eventDate: string | null;
  dueAt: string | null;
  timeZone: string;
  calendarDateInZone: (instant: Date, timeZone: string) => string;
}): string | null {
  if (args.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(args.eventDate)) {
    return args.eventDate;
  }
  if (args.dueAt) {
    const instant = new Date(args.dueAt);
    if (!Number.isNaN(instant.getTime())) {
      return args.calendarDateInZone(instant, args.timeZone);
    }
  }
  return null;
}

export type WatchBucket = "today" | "needsAttention" | "comingUp" | "later";

const ACTION_TYPES = new Set<GuardianItemType>([
  "deadline",
  "task",
  "payment",
  "renewal",
  "expiration",
  "follow_up",
  "commitment",
  "return_window",
  "document_requirement",
  "reminder",
]);

/**
 * Assign a single primary bucket. Priority: Today > Needs Attention > Coming Up > Later.
 */
export function classifyWatchBucket(args: {
  type: GuardianItemType;
  requiresAction: boolean;
  priority: GuardianItemPriority;
  effectiveDate: string | null;
  today: string;
  horizonDays: number;
}): WatchBucket {
  const days =
    args.effectiveDate != null
      ? daysBetween(args.today, args.effectiveDate)
      : null;

  const isTodayOccurrence =
    days === 0 &&
    (args.type === "appointment" ||
      args.type === "event" ||
      args.type === "school_closure" ||
      args.type === "payment" ||
      args.type === "deadline" ||
      args.type === "task" ||
      args.type === "travel" ||
      args.type === "birthday");

  if (isTodayOccurrence) {
    return "today";
  }

  const needsAttention =
    args.requiresAction ||
    ACTION_TYPES.has(args.type) ||
    args.priority === "urgent" ||
    args.priority === "high";

  if (needsAttention) {
    if (days !== null && days < 0) return "needsAttention";
    if (days !== null && days <= 7) return "needsAttention";
    if (args.type === "follow_up" && (days === null || days <= 14)) {
      return "needsAttention";
    }
    if (days === null && args.requiresAction) return "needsAttention";
  }

  // Near-term calendar events (summits, appointments, travel) belong in
  // Needs Attention even without an explicit action flag.
  const isNearTermCalendar =
    days !== null &&
    days > 0 &&
    days <= 7 &&
    (args.type === "event" ||
      args.type === "appointment" ||
      args.type === "travel");
  if (isNearTermCalendar) {
    return "needsAttention";
  }

  if (days !== null && days > 0 && days <= args.horizonDays) {
    return "comingUp";
  }

  return "later";
}
