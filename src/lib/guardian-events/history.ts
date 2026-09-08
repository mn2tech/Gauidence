/**
 * Lightweight History presentation helpers (filters, labels, icons).
 */

import type { GuardianEvent, GuardianEventType } from "./types";
import { groupGuardianEventsByDate } from "./sort";
import { formatGuardianEventSourceLabel } from "./provenance";

export const HISTORY_FILTERS = [
  "all",
  "personal",
  "business",
  "meetings",
  "decisions",
  "tasks",
  "documents",
  "insights",
] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

export function isHistoryFilter(value: unknown): value is HistoryFilter {
  return (
    typeof value === "string" &&
    (HISTORY_FILTERS as readonly string[]).includes(value)
  );
}

const MEETING_TYPES: GuardianEventType[] = ["meeting"];
const DECISION_TYPES: GuardianEventType[] = ["decision"];
const TASK_TYPES: GuardianEventType[] = [
  "task_created",
  "task_completed",
  "follow_up",
  "reminder",
  "deadline",
];
const DOCUMENT_TYPES: GuardianEventType[] = ["document_added", "email"];
const INSIGHT_TYPES: GuardianEventType[] = [
  "guardian_insight",
  "observation",
  "relationship_change",
];

export function eventMatchesHistoryFilter(
  event: GuardianEvent,
  filter: HistoryFilter,
  spaceMeta?: Map<string, { profile_type?: string | null }>
): boolean {
  const meta = event.metadata ?? {};
  const isDerived =
    meta.extracted_from_daily_log === true ||
    meta.derived_from_tell_guardian === true;

  // Default History timeline: one card per source note (hide extracted twins).
  // Typed filters still surface follow-ups / meetings / insights.
  if (filter === "all" && isDerived) return false;

  if (filter === "all") return true;
  if (filter === "meetings") return MEETING_TYPES.includes(event.event_type);
  if (filter === "decisions") return DECISION_TYPES.includes(event.event_type);
  if (filter === "tasks") return TASK_TYPES.includes(event.event_type);
  if (filter === "documents") return DOCUMENT_TYPES.includes(event.event_type);
  if (filter === "insights") return INSIGHT_TYPES.includes(event.event_type);

  if (filter === "personal" || filter === "business") {
    if (isDerived) return false;
    if (!event.space_id) return filter === "personal";
    const space = spaceMeta?.get(event.space_id);
    const type = space?.profile_type ?? "";
    if (filter === "business") {
      return /business|client|employee|nonprofit|organization/i.test(type);
    }
    return /personal|family|parent|child|hobby|other/i.test(type) || !type;
  }
  return true;
}

export function historyEventTypeLabel(type: GuardianEventType): string {
  switch (type) {
    case "daily_log_entry":
      return "Note";
    case "meeting":
      return "Meeting";
    case "follow_up":
      return "Follow-up";
    case "document_added":
      return "Document";
    case "guardian_insight":
      return "Guardian noticed";
    case "task_created":
      return "Task";
    case "task_completed":
      return "Task done";
    case "relationship_change":
      return "Relationship";
    default:
      return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

export type HistoryEventCard = {
  id: string;
  eventType: GuardianEventType;
  typeLabel: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  status: string;
  actionRequired: boolean;
  spaceId: string | null;
  sourceLabel: string;
  sourceType: string;
  sourceId: string | null;
  relatedEntities: Array<{ name: string; type?: string }>;
};

export function toHistoryEventCard(event: GuardianEvent): HistoryEventCard {
  const related = Array.isArray(event.metadata?.related_entities)
    ? event.metadata.related_entities
        .filter(
          (e): e is { name: string; type?: string } =>
            Boolean(e && typeof e === "object" && typeof e.name === "string")
        )
        .map((e) => ({ name: e.name, type: e.type }))
    : [];

  return {
    id: event.id,
    eventType: event.event_type,
    typeLabel: historyEventTypeLabel(event.event_type),
    title: event.title,
    summary: event.summary,
    occurredAt: event.occurred_at,
    status: event.status,
    actionRequired: event.action_required,
    spaceId: event.space_id,
    sourceLabel: formatGuardianEventSourceLabel(event),
    sourceType: event.source_type,
    sourceId: event.source_id,
    relatedEntities: related,
  };
}

export function buildHistoryTimeline(
  events: GuardianEvent[],
  filter: HistoryFilter = "all",
  spaceMeta?: Map<string, { profile_type?: string | null }>
): Array<{ date: string; events: HistoryEventCard[] }> {
  const filtered = events.filter((e) =>
    eventMatchesHistoryFilter(e, filter, spaceMeta)
  );
  return groupGuardianEventsByDate(filtered).map((g) => ({
    date: g.date,
    events: g.events.map(toHistoryEventCard),
  }));
}

/** Format YYYY-MM-DD for History section headings. */
export function formatHistoryDayHeading(
  isoDate: string,
  todayIso?: string
): string {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  if (isoDate === today) return "Today";
  const y = new Date(`${today}T12:00:00.000Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  if (isoDate === yesterday) return "Yesterday";

  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
