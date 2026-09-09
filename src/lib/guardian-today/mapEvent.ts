/**
 * Map guardian_events → Today intelligence cards.
 */

import type { GuardianEvent, GuardianEventType } from "@/lib/guardian-events/types";
import { historyEventTypeLabel } from "@/lib/guardian-events/history";
import { buildProvenanceMessage, mapSourceType } from "./mapItem";
import type {
  GuardianIntelligenceItem,
  IntelligencePriority,
  IntelligenceType,
  TodayRecentEntry,
} from "./types";

export const EVENT_ID_PREFIX = "evt:";

export function isGuardianEventIntelligenceId(id: string): boolean {
  return id.startsWith(EVENT_ID_PREFIX);
}

export function stripEventIntelligenceId(id: string): string {
  return isGuardianEventIntelligenceId(id)
    ? id.slice(EVENT_ID_PREFIX.length)
    : id;
}

const EVENT_TYPE_MAP: Partial<Record<GuardianEventType, IntelligenceType>> = {
  deadline: "deadline",
  follow_up: "follow_up",
  reminder: "task",
  decision: "decision",
  task_created: "task",
  task_completed: "task",
  meeting: "important_fact",
  document_added: "change",
  email: "change",
  guardian_insight: "opportunity",
  observation: "important_fact",
  note: "important_fact",
  daily_log_entry: "important_fact",
};

export function mapEventTypeToIntelligence(
  type: GuardianEventType
): IntelligenceType {
  return EVENT_TYPE_MAP[type] ?? "important_fact";
}

function priorityForEvent(event: GuardianEvent): IntelligencePriority {
  if (event.importance_score >= 0.85) return "critical";
  if (event.importance_score >= 0.7 || event.action_required) return "high";
  if (event.importance_score >= 0.5) return "medium";
  return "low";
}

function scoreForEvent(event: GuardianEvent): number {
  let score = event.importance_score * 100;
  if (event.action_required) score += 25;
  if (event.event_type === "follow_up" || event.event_type === "deadline") {
    score += 10;
  }
  return score;
}

function effectiveDateFromEvent(event: GuardianEvent): string | null {
  const iso = event.occurred_at;
  if (!iso) return null;
  return iso.slice(0, 10);
}

function suggestedActionForEvent(event: GuardianEvent): string | null {
  if (!event.action_required) return null;
  if (event.event_type === "follow_up") return "Follow up";
  if (event.event_type === "deadline") return "Review before the deadline";
  return "Review";
}

/** Open action-required events → Needs attention cards. */
export function toIntelligenceItemFromEvent(
  event: GuardianEvent,
  spaceName: string | null
): GuardianIntelligenceItem {
  const intelligenceType = mapEventTypeToIntelligence(event.event_type);
  const effectiveDate = effectiveDateFromEvent(event);
  const sourceTitle =
    typeof event.metadata?.source_label === "string"
      ? event.metadata.source_label
      : null;

  return {
    id: `${EVENT_ID_PREFIX}${event.id}`,
    userId: event.user_id,
    spaceId: event.space_id ?? "",
    spaceName,
    childName: null,
    sourceId: event.source_id,
    sourceType: mapSourceType(event.source_type),
    sourceDocumentId: null,
    sourceTitle,
    sourceExcerpt: event.summary,
    worldEntityId: null,
    type: intelligenceType,
    title: event.title,
    summary: event.summary?.trim() || "This needs your attention.",
    dueAt: event.occurred_at,
    effectiveDate,
    status: "open",
    priority: priorityForEvent(event),
    score: scoreForEvent(event),
    confidence: event.confidence_score,
    reason: event.action_required
      ? "Open follow-up from History"
      : "From your History",
    suggestedAction: suggestedActionForEvent(event),
    provenanceMessage: buildProvenanceMessage({
      title: event.title,
      effectiveDate,
      sourceTitle,
      spaceName,
      type: intelligenceType,
    }),
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    origin: "guardian_event",
  };
}

export function toTodayRecentEntry(
  event: GuardianEvent,
  spaceName: string | null
): TodayRecentEntry {
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    occurredAt: event.occurred_at,
    spaceId: event.space_id,
    spaceName,
    eventType: event.event_type,
    typeLabel: historyEventTypeLabel(event.event_type),
  };
}

export function isDerivedHistoryEvent(event: GuardianEvent): boolean {
  const meta = event.metadata ?? {};
  return (
    meta.extracted_from_daily_log === true ||
    meta.derived_from_tell_guardian === true
  );
}
