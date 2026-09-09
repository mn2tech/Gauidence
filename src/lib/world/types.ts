/**
 * My World types. WorldEntity aliases SemanticEntity (semantic_* is the store).
 */

import type {
  SemanticEntity,
  SemanticEvidence,
  SemanticExtractionInput,
  SemanticIngestResult,
  SemanticSourceType,
} from "@/lib/semantic/types";

export type WorldSourceType = SemanticSourceType;

export type WorldEntityStatus = "active" | "merged" | "rejected" | "candidate";

export const WORLD_ENTITY_STATUS = [
  "active",
  "merged",
  "rejected",
  "candidate",
] as const satisfies readonly WorldEntityStatus[];

/** Consumer-facing alias — persisted in semantic_entities. */
export type WorldEntity = SemanticEntity & {
  importance_score?: number | null;
  status?: WorldEntityStatus | string;
  merged_into_id?: string | null;
};

export type WorldIdentityBand = "high" | "medium" | "low";

export type WorldIdentityResolution = {
  entity: WorldEntity;
  band: WorldIdentityBand;
  /** How the match was found when auto-resolved or suggested. */
  resolution:
    | "exact"
    | "alias"
    | "email"
    | "phone"
    | "org_cooccurrence"
    | "fuzzy"
    | "created"
    | "candidate";
  confidence: number;
  /** Suggested merge target when band is medium (do not auto-merge). */
  suggestedMergeEntityId?: string | null;
  inboxCreated?: boolean;
};

export type WorldInboxItemType =
  | "ENTITY_CONFIRMATION"
  | "ENTITY_MERGE"
  | "RELATIONSHIP_CONFIRMATION"
  | "TRACKING_SUGGESTION"
  | "AMBIGUOUS_FACT";

export const WORLD_INBOX_TYPES = [
  "ENTITY_CONFIRMATION",
  "ENTITY_MERGE",
  "RELATIONSHIP_CONFIRMATION",
  "TRACKING_SUGGESTION",
  "AMBIGUOUS_FACT",
] as const satisfies readonly WorldInboxItemType[];

export type WorldInboxStatus =
  | "pending"
  | "confirmed"
  | "edited"
  | "merged"
  | "rejected"
  | "ignored";

export type WorldInboxItem = {
  id: string;
  user_id: string;
  space_id: string | null;
  type: WorldInboxItemType | string;
  status: WorldInboxStatus | string;
  confidence: number | null;
  semantic_entity_id: string | null;
  related_entity_ids: string[];
  candidate: Record<string, unknown>;
  reason: string | null;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type WorldTimelineEntryType =
  | "security_incident"
  | "proposal_sent"
  | "contract_signed"
  | "meeting_occurred"
  | "invoice_received"
  | "school_communication"
  | "deadline_created"
  | "relationship_change"
  | "commitment_created"
  | "document_notable"
  | "other_important";

export const WORLD_TIMELINE_ENTRY_TYPES = [
  "security_incident",
  "proposal_sent",
  "contract_signed",
  "meeting_occurred",
  "invoice_received",
  "school_communication",
  "deadline_created",
  "relationship_change",
  "commitment_created",
  "document_notable",
  "other_important",
] as const satisfies readonly WorldTimelineEntryType[];

export type WorldTimelineEntry = {
  id: string;
  user_id: string;
  space_id: string | null;
  entry_type: string;
  title: string;
  summary: string | null;
  occurred_at: string;
  importance_score: number;
  confidence: number | null;
  primary_entity_id: string | null;
  related_entity_ids: string[];
  source_type: string;
  source_id: string;
  guardian_event_id: string | null;
  evidence_id: string | null;
  dedupe_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorldProcessInput = SemanticExtractionInput;

export type WorldProcessResult = SemanticIngestResult & {
  timelineCreated: number;
  inboxCreated: number;
  identityResolutions: WorldIdentityResolution[];
};

export type { SemanticEvidence };
