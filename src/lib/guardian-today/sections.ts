/**
 * Pure helpers to assemble Today sections (Watch + events).
 */

import type { GuardianEvent } from "@/lib/guardian-events/types";
import {
  isDerivedHistoryEvent,
  toIntelligenceItemFromEvent,
  toTodayRecentEntry,
} from "./mapEvent";
import type {
  GuardianIntelligenceItem,
  TodayRecentEntry,
} from "./types";

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Drop event cards that duplicate a Watch item already shown. */
export function dedupeEventItemsAgainstWatch(
  eventItems: GuardianIntelligenceItem[],
  watchItems: GuardianIntelligenceItem[]
): GuardianIntelligenceItem[] {
  const keys = new Set(
    watchItems.map((i) => `${i.spaceId}|${normalizeTitle(i.title)}`)
  );
  return eventItems.filter((e) => {
    if (e.sourceId && watchItems.some((w) => w.id === e.sourceId)) {
      return false;
    }
    return !keys.has(`${e.spaceId}|${normalizeTitle(e.title)}`);
  });
}

export function mergeAttentionLists(
  watchAttention: GuardianIntelligenceItem[],
  eventAttention: GuardianIntelligenceItem[]
): GuardianIntelligenceItem[] {
  const merged = [
    ...watchAttention,
    ...dedupeEventItemsAgainstWatch(eventAttention, watchAttention),
  ];
  return merged.sort((a, b) => b.score - a.score);
}

export function buildRecentFromEvents(
  events: GuardianEvent[],
  spaceNames: Map<string, string>,
  limit = 10
): TodayRecentEntry[] {
  const out: TodayRecentEntry[] = [];
  for (const event of events) {
    if (isDerivedHistoryEvent(event)) continue;
    out.push(
      toTodayRecentEntry(
        event,
        event.space_id ? spaceNames.get(event.space_id) ?? null : null
      )
    );
    if (out.length >= limit) break;
  }
  return out;
}

export function mapOpenActionEvents(
  events: GuardianEvent[],
  spaceNames: Map<string, string>
): GuardianIntelligenceItem[] {
  return events
    .filter((e) => e.status === "open" && e.action_required)
    .map((e) =>
      toIntelligenceItemFromEvent(
        e,
        e.space_id ? spaceNames.get(e.space_id) ?? null : null
      )
    );
}
