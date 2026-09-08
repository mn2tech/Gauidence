/**
 * Guardian Events — History / temporal intelligence types.
 * Parallel to daily_logs; does not replace original evidence.
 * Distinct from guardian_action_events (AI action audit).
 */

export const GUARDIAN_EVENT_TYPES = [
  "note",
  "meeting",
  "document_added",
  "email",
  "decision",
  "task_created",
  "task_completed",
  "reminder",
  "deadline",
  "observation",
  "guardian_insight",
  "relationship_change",
  "follow_up",
  "daily_log_entry",
] as const;

export type GuardianEventType = (typeof GUARDIAN_EVENT_TYPES)[number];

export const GUARDIAN_EVENT_STATUSES = [
  "open",
  "completed",
  "dismissed",
  "cancelled",
] as const;

export type GuardianEventStatus = (typeof GUARDIAN_EVENT_STATUSES)[number];

export const GUARDIAN_EVENT_CREATED_BY = [
  "user",
  "system",
  "gideon",
  "backfill",
  "watch",
] as const;

export type GuardianEventCreatedBy = (typeof GUARDIAN_EVENT_CREATED_BY)[number];

/** Well-known source_type values (extensible string in DB). */
export const GUARDIAN_EVENT_SOURCE_TYPES = [
  "daily_log",
  "document",
  "email",
  "manual",
  "guardian_item",
  "reminder",
  "tell_guardian",
] as const;

export type GuardianEventSourceType =
  | (typeof GUARDIAN_EVENT_SOURCE_TYPES)[number]
  | (string & {});

export type GuardianEventMetadata = {
  /** Display labels for related people/orgs/projects (Phase 3+ may harden). */
  related_entities?: Array<{
    name: string;
    type?: string;
    id?: string;
  }>;
  /** Original daily_logs.log_date when sourced from a Daily Log. */
  log_date?: string;
  /** Human-readable source label override. */
  source_label?: string;
  [key: string]: unknown;
};

export type GuardianEvent = {
  id: string;
  user_id: string;
  space_id: string | null;
  event_type: GuardianEventType;
  title: string;
  summary: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  source_type: string;
  source_id: string | null;
  dedupe_key: string | null;
  importance_score: number;
  action_required: boolean;
  status: GuardianEventStatus;
  metadata: GuardianEventMetadata;
  created_by: GuardianEventCreatedBy;
  confidence_score: number | null;
};

export type CreateGuardianEventInput = {
  userId: string;
  spaceId?: string | null;
  eventType: GuardianEventType;
  title: string;
  summary?: string | null;
  occurredAt?: string;
  sourceType?: string;
  sourceId?: string | null;
  dedupeKey?: string | null;
  importanceScore?: number;
  actionRequired?: boolean;
  status?: GuardianEventStatus;
  metadata?: GuardianEventMetadata;
  createdBy?: GuardianEventCreatedBy;
  confidenceScore?: number | null;
};

export type ListGuardianEventsFilter = {
  userId: string;
  /** Restrict to these spaces (intersected with authorized). */
  spaceIds?: string[];
  /** Include unscoped (space_id null) events owned by the user. Default true. */
  includeUnscoped?: boolean;
  eventTypes?: GuardianEventType[];
  statuses?: GuardianEventStatus[];
  actionRequired?: boolean;
  sourceType?: string;
  sourceId?: string;
  /** Inclusive ISO lower bound on occurred_at. */
  occurredFrom?: string;
  /** Inclusive ISO upper bound on occurred_at. */
  occurredTo?: string;
  limit?: number;
  offset?: number;
};

export function isGuardianEventType(value: unknown): value is GuardianEventType {
  return (
    typeof value === "string" &&
    (GUARDIAN_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function isGuardianEventStatus(
  value: unknown
): value is GuardianEventStatus {
  return (
    typeof value === "string" &&
    (GUARDIAN_EVENT_STATUSES as readonly string[]).includes(value)
  );
}
