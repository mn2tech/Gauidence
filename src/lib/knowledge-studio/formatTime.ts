/** Display helpers for Knowledge Studio public answers (pure / testable). */

export const CROSSROADS_DISPLAY_TIME_ZONE = "America/New_York";

/**
 * Format an ISO timestamptz for CrossRoads attendees (Eastern).
 * Never labels the result as UTC.
 */
export function formatEasternDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    timeZone: CROSSROADS_DISPLAY_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function formatEasternTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined
): string | null {
  const start = formatEasternDateTime(startIso);
  if (!start) return null;
  if (!endIso?.trim()) return start;
  const endDate = new Date(endIso);
  if (Number.isNaN(endDate.getTime())) return start;
  const endTime = endDate.toLocaleString("en-US", {
    timeZone: CROSSROADS_DISPLAY_TIME_ZONE,
    timeStyle: "short",
  });
  return `${start} – ${endTime} Eastern Time`;
}

export function formatEasternNow(now: Date = new Date()): string {
  return now.toLocaleString("en-US", {
    timeZone: CROSSROADS_DISPLAY_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  });
}

/** End of event for "is it over?" checks — prefers end_at, else start_at. */
export function eventEffectiveEndMs(event: {
  start_at?: string | null;
  end_at?: string | null;
}): number | null {
  if (event.end_at?.trim()) {
    const t = new Date(event.end_at).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (event.start_at?.trim()) {
    const t = new Date(event.start_at).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** True when the event has not ended yet (still upcoming or in progress). */
export function isEventStillActive(
  event: { start_at?: string | null; end_at?: string | null },
  nowMs: number = Date.now()
): boolean {
  const end = eventEffectiveEndMs(event);
  if (end == null) return false;
  return end > nowMs;
}

/** User is asking specifically for the next / upcoming event. */
export function wantsNextUpcomingEvent(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return (
    (/\b(next|upcoming|coming up)\b/i.test(q) && /\bevents?\b/i.test(q)) ||
    /\bwhat(?:'s| is) next\b/i.test(q)
  );
}
