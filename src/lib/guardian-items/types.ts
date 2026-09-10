/** Guardian item types, statuses, priorities, and Watch constants. */

import type { TemporalMetadata } from "./lifecycle";

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
  "school_event",
  "homework",
  "test",
  "study_reminder",
  "spelling_list",
  "announcement",
  "school_contact",
  "early_dismissal",
  "no_school",
  "no_homework",
] as const;

export type GuardianItemType = (typeof GUARDIAN_ITEM_TYPES)[number];

export const GUARDIAN_ITEM_STATUSES = [
  "active",
  "completed",
  "dismissed",
  "expired",
  "cancelled",
  "superseded",
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

export const GUARDIAN_ITEM_EXTRACTION_VERSION = "v2-school-newsletter";

/** School newsletter document type stored on extracted_data.document_type. */
export const SCHOOL_NEWSLETTER_DOCUMENT_TYPE = "school_newsletter";

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
  superseded_by_id?: string | null;
  /** Extensible metadata; semantic refs + temporal lifecycle live here. */
  metadata?: {
    semantic_entity_ids?: string[];
    semantic_relationship_ids?: string[];
    semantic_fact_ids?: string[];
    /** Computed Temporal & Lifecycle Intelligence (immutable source docs stay separate). */
    temporal?: TemporalMetadata;
    newsletter?: boolean;
    spelling_words?: string[];
    logical_fingerprint?: string;
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
  /** Evaluated lifecycle (from metadata.temporal or fresh reevaluation). */
  temporal?: TemporalMetadata | null;
};

export type GuardianWatchResult = {
  today: GuardianWatchItem[];
  needsAttention: GuardianWatchItem[];
  comingUp: GuardianWatchItem[];
  later: GuardianWatchItem[];
};
