/**
 * Pure sort helpers (no server-only) for History timeline ordering.
 */

import type { GuardianEvent } from "./types";

/** Sort by occurred_at (then created_at). Default: newest first. */
export function sortGuardianEventsByOccurredAt(
  events: GuardianEvent[],
  ascending = false
): GuardianEvent[] {
  const dir = ascending ? 1 : -1;
  return [...events].sort((a, b) => {
    return (
      a.occurred_at.localeCompare(b.occurred_at) * dir ||
      a.created_at.localeCompare(b.created_at) * dir
    );
  });
}

/** Group events by calendar day (UTC date of occurred_at) for History UI. */
export function groupGuardianEventsByDate(
  events: GuardianEvent[]
): Array<{ date: string; events: GuardianEvent[] }> {
  const sorted = sortGuardianEventsByOccurredAt(events, false);
  const map = new Map<string, GuardianEvent[]>();
  for (const event of sorted) {
    const date = event.occurred_at.slice(0, 10) || "unknown";
    const list = map.get(date) ?? [];
    list.push(event);
    map.set(date, list);
  }
  return [...map.entries()].map(([date, dayEvents]) => ({
    date,
    events: dayEvents,
  }));
}
