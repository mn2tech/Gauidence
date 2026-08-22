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
