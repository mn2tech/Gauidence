/** Guardian item types, statuses, priorities, and Watch constants. */

export const GUARDIAN_ITEM_TYPES = [
  "event",
  "deadline",
  "reminder",
  "task",
  "payment",
  "renewal",
  "expiration",
  "appointment",
  "school_closure",
  "follow_up",
  "commitment",
  "return_window",
  "warranty",
  "birthday",
  "travel",
  "document_requirement",
  "informational",
] as const;

export type GuardianItemType = (typeof GUARDIAN_ITEM_TYPES)[number];

export const GUARDIAN_ITEM_STATUSES = [
  "active",
  "completed",
  "dismissed",
  "expired",
  "cancelled",
] as const;

export type GuardianItemStatus = (typeof GUARDIAN_ITEM_STATUSES)[number];

export const GUARDIAN_ITEM_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type GuardianItemPriority = (typeof GUARDIAN_ITEM_PRIORITIES)[number];

export const GUARDIAN_WATCH_HORIZON_DAYS = 30;

export const GUARDIAN_ITEM_EXTRACTION_VERSION = "v1";

/** Auto-create threshold. */
export const CONFIDENCE_AUTO = 0.9;
/** Create with needs_review. */
export const CONFIDENCE_REVIEW = 0.75;

export type GuardianItemRow = {
  id: string;
  user_id: string;
  space_id: string;
  child_id: string | null;
  school_context_id: string | null;
  type: GuardianItemType;
  title: string;
  description: string | null;
  event_date: string | null;
  start_at: string | null;
  end_at: string | null;
  due_at: string | null;
  remind_at: string | null;
  status: GuardianItemStatus;
  priority: GuardianItemPriority;
  requires_action: boolean;
  action_label: string | null;
  action_url: string | null;
  source_type: string;
  source_id: string | null;
  source_document_id: string | null;
  source_excerpt: string | null;
  source_page: number | null;
  confidence: number | null;
  needs_review: boolean;
  extraction_version: string | null;
  dedupe_key: string;
  /** Extensible metadata; semantic refs live under semantic_*_ids keys. */
  metadata?: {
    semantic_entity_ids?: string[];
    semantic_relationship_ids?: string[];
    semantic_fact_ids?: string[];
    [key: string]: unknown;
  } | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  dismissed_at: string | null;
};

export type GuardianWatchItem = GuardianItemRow & {
  space_name: string | null;
  child_name: string | null;
  /** Effective calendar date used for Watch bucketing (YYYY-MM-DD). */
  effective_date: string | null;
};

export type GuardianWatchResult = {
  today: GuardianWatchItem[];
  needsAttention: GuardianWatchItem[];
  comingUp: GuardianWatchItem[];
  later: GuardianWatchItem[];
};
