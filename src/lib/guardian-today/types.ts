import type {
  GuardianItemPriority,
  GuardianItemType,
  GuardianWatchItem,
} from "@/lib/guardian-items/types";

/** Normalized intelligence types surfaced in Guardian Today. */
export const INTELLIGENCE_TYPES = [
  "deadline",
  "task",
  "commitment",
  "risk",
  "opportunity",
  "change",
  "decision",
  "follow_up",
  "important_fact",
] as const;

export type IntelligenceType = (typeof INTELLIGENCE_TYPES)[number];

export const INTELLIGENCE_PRIORITIES = [
  "critical",
  "high",
  "medium",
  "low",
] as const;

export type IntelligencePriority = (typeof INTELLIGENCE_PRIORITIES)[number];

export const INTELLIGENCE_STATUSES = [
  "open",
  "completed",
  "dismissed",
  "snoozed",
] as const;

export type IntelligenceStatus = (typeof INTELLIGENCE_STATUSES)[number];

export const INTELLIGENCE_SOURCE_TYPES = [
  "document",
  "conversation",
  "daily_log",
  "note",
  "reminder",
  "knowledge",
  "other",
] as const;

export type IntelligenceSourceType = (typeof INTELLIGENCE_SOURCE_TYPES)[number];

export type GuardianIntelligenceItem = {
  id: string;
  userId: string;
  spaceId: string;
  spaceName: string | null;
  childName: string | null;

  sourceId: string | null;
  sourceType: IntelligenceSourceType;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;

  type: IntelligenceType;
  title: string;
  summary: string;

  dueAt: string | null;
  effectiveDate: string | null;

  status: IntelligenceStatus;
  priority: IntelligencePriority;
  score: number;
  confidence: number | null;

  reason: string;
  suggestedAction: string | null;
  provenanceMessage: string;

  createdAt: string;
  updatedAt: string;

  /** Watch item (default) vs History event card. */
  origin?: "watch_item" | "guardian_event";
};

/** Lightweight Recent row from guardian_events (History). */
export type TodayRecentEntry = {
  id: string;
  title: string;
  summary: string | null;
  occurredAt: string;
  spaceId: string | null;
  spaceName: string | null;
  eventType: string;
  typeLabel: string;
};

export type WhatChangedEntry = {
  id: string;
  label: string;
  spaceName: string | null;
  occurredAt: string;
  itemId: string;
  spaceId: string;
};

/** Processing state for Guardian intelligence across accessible Spaces. */
export const GUARDIAN_PIPELINE_STATUSES = [
  "never_scanned",
  "processing",
  "ready",
  "partial",
  "failed",
  "no_sources",
] as const;

export type GuardianIntelligencePipelineStatus =
  (typeof GUARDIAN_PIPELINE_STATUSES)[number];

export type GuardianTodayCoverage = {
  spaceCount: number;
  sourceCount: number;
  processedSourceCount: number;
  pendingSourceCount: number;
  processingSourceCount: number;
  failedSourceCount: number;
  activeItemCount: number;
  lastExtractionAt: string | null;
  lastWatchEvaluationAt: string | null;
  status: GuardianIntelligencePipelineStatus;
};

export type GuardianTodaySpaceGroup = {
  spaceId: string;
  spaceName: string;
  profileType: string | null;
  priorities: GuardianIntelligenceItem[];
};

export type GuardianTodayResult = {
  priorities: GuardianIntelligenceItem[];
  /** Needs attention — Watch today/overdue + open action events. */
  needsAttention: GuardianIntelligenceItem[];
  /** Upcoming — Watch comingUp (deadlines / horizon). */
  upcoming: GuardianIntelligenceItem[];
  /** Recent History events (not derived twins). */
  recent: TodayRecentEntry[];
  /** Priorities grouped by top-level Space (Personal, Business, …). */
  groups: GuardianTodaySpaceGroup[];
  /** When set, Today is scoped to that Space only (no nested expansion). */
  scopeSpaceId: string | null;
  scopeSpaceName: string | null;
  whatChanged: WhatChangedEntry[];
  /**
   * True ONLY when accessible Spaces were evaluated, sources processed,
   * Watch Engine ran, and zero actionable priorities remain.
   */
  caughtUp: boolean;
  coverage: GuardianTodayCoverage;
  coverageSummary: string | null;
  backfillRecommended: boolean;
};

export type ScoredWatchItem = GuardianWatchItem & {
  resolvedPriority: GuardianItemPriority;
  score: number;
  reason: string;
};
