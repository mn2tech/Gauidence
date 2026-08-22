import { isEventStillActive, wantsNextUpcomingEvent } from "./formatTime";
import type { KnowledgeEventRow, KnowledgeFactRow } from "./types";

export type OrgKnowledgeSlice = {
  facts: KnowledgeFactRow[];
  events: KnowledgeEventRow[];
};

export const NO_APPROVED_CROSSROADS_ANSWER =
  "I don't have approved CrossRoads Connect information about that yet.";

export const NO_UPCOMING_CROSSROADS_EVENT =
  "There isn't a published upcoming CrossRoads Connect event right now.";

function sortEventsByStart(events: KnowledgeEventRow[]): KnowledgeEventRow[] {
  return [...events].sort((a, b) => {
    const aT = a.start_at ? new Date(a.start_at).getTime() : Number.POSITIVE_INFINITY;
    const bT = b.start_at ? new Date(b.start_at).getTime() : Number.POSITIVE_INFINITY;
    return aT - bT;
  });
}

/**
 * For "next event" questions, only keep events that have not ended.
 * For other questions, keep all published events (prompt can still label PAST).
 */
export function scopeKnowledgeForQuestion(
  knowledge: OrgKnowledgeSlice,
  question: string,
  nowMs: number = Date.now()
): OrgKnowledgeSlice {
  const sorted = sortEventsByStart(knowledge.events);
  if (wantsNextUpcomingEvent(question)) {
    return {
      facts: knowledge.facts,
      events: sorted.filter((e) => isEventStillActive(e, nowMs)),
    };
  }
  return { facts: knowledge.facts, events: sorted };
}

/** Label each event PAST vs UPCOMING_OR_IN_PROGRESS for the LLM prompt. */
export function withEventStatusLabels(
  knowledge: OrgKnowledgeSlice,
  nowMs: number
): OrgKnowledgeSlice {
  return {
    facts: knowledge.facts,
    events: knowledge.events.map((event) => {
      const active = isEventStillActive(event, nowMs);
      const status = active ? "UPCOMING_OR_IN_PROGRESS" : "PAST";
      const description = event.description
        ? `[STATUS: ${status}] ${event.description}`
        : `[STATUS: ${status}]`;
      return { ...event, description };
    }),
  };
}
