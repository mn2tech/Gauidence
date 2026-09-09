/**
 * Deterministic importance scoring for My World ranking and timeline gates.
 */

import type { WorldTimelineEntryType } from "./types";

/** Minimum importance to emit a world_timeline_entry. */
export const TIMELINE_IMPORTANCE_THRESHOLD = 0.55;

const ENTITY_TYPE_BASE: Record<string, number> = {
  person: 0.55,
  organization: 0.5,
  agency: 0.55,
  client: 0.6,
  school: 0.55,
  project: 0.6,
  contract: 0.7,
  opportunity: 0.65,
  account: 0.55,
  asset: 0.45,
  event: 0.5,
  document: 0.35,
  deadline: 0.7,
  task: 0.45,
  topic: 0.3,
  location: 0.35,
  place: 0.35,
  product: 0.4,
  payment: 0.55,
};

const TIMELINE_TYPE_SCORE: Record<WorldTimelineEntryType, number> = {
  security_incident: 0.95,
  contract_signed: 0.9,
  proposal_sent: 0.75,
  invoice_received: 0.7,
  deadline_created: 0.75,
  meeting_occurred: 0.6,
  school_communication: 0.65,
  relationship_change: 0.7,
  commitment_created: 0.65,
  document_notable: 0.55,
  other_important: 0.55,
};

export function scoreEntityImportance(args: {
  entityType: string;
  relationshipDegree?: number;
  factCount?: number;
  confidence?: number | null;
  recencyDays?: number | null;
}): number {
  const base = ENTITY_TYPE_BASE[args.entityType] ?? 0.4;
  const degreeBoost = Math.min(0.2, (args.relationshipDegree ?? 0) * 0.03);
  const factBoost = Math.min(0.1, (args.factCount ?? 0) * 0.02);
  const conf =
    typeof args.confidence === "number"
      ? Math.max(0, Math.min(1, args.confidence)) * 0.1
      : 0;
  let recency = 0;
  if (args.recencyDays != null && Number.isFinite(args.recencyDays)) {
    if (args.recencyDays <= 7) recency = 0.1;
    else if (args.recencyDays <= 30) recency = 0.05;
  }
  return Math.min(1, Math.max(0, base + degreeBoost + factBoost + conf + recency));
}

export function scoreTimelineImportance(
  entryType: WorldTimelineEntryType | string,
  confidence?: number | null
): number {
  const base =
    TIMELINE_TYPE_SCORE[entryType as WorldTimelineEntryType] ??
    TIMELINE_TYPE_SCORE.other_important;
  const confBoost =
    typeof confidence === "number"
      ? Math.max(0, Math.min(1, confidence)) * 0.05
      : 0;
  return Math.min(1, base + confBoost);
}

export function shouldEmitTimelineEntry(
  importance: number,
  entryType?: string
): boolean {
  if (importance < TIMELINE_IMPORTANCE_THRESHOLD) return false;
  // Tiny document noise: document_notable needs higher bar
  if (entryType === "document_notable" && importance < 0.7) return false;
  return true;
}
