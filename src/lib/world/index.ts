/**
 * My World — product layer ABOVE Spaces, ontology, semantic_*, guardian_items, Watch.
 *
 * Layer map (do not duplicate stores):
 *
 *   Sources → Extraction
 *     → ontology_*          (space-scoped knowledge; keep)
 *     → semantic_*          (user-scoped World store — THIS is world_entities/etc.)
 *     → guardian_items      (actionable memory + Watch)
 *     → guardian_events     (History)
 *     → world_inbox_items   (confirmations / merges)
 *     → world_timeline_entries (high-signal moments)
 *   → My World UI / APIs → Watch → Guardian Today → Gideon → Actions
 *
 * Product language: People, Organizations, Things, Events, Connections.
 * Never expose "ontology", "vectors", "chunks", or "semantic graph" in consumer UI.
 */

export type {
  WorldEntity,
  WorldEntityStatus,
  WorldInboxItem,
  WorldInboxItemType,
  WorldInboxStatus,
  WorldIdentityBand,
  WorldIdentityResolution,
  WorldProcessResult,
  WorldSourceType,
  WorldTimelineEntry,
  WorldTimelineEntryType,
} from "./types";

export {
  WORLD_INBOX_TYPES,
  WORLD_TIMELINE_ENTRY_TYPES,
  WORLD_ENTITY_STATUS,
} from "./types";

export { resolveWorldIdentity } from "./identityResolver";
export type { ResolveWorldIdentityOptions } from "./identityResolver";

export {
  extractEmailFromCandidate,
  extractPhoneFromCandidate,
  bandFromIdentitySignal,
  shouldAutoResolvePeople,
} from "./identitySignals";
export type { IdentityMatchSignal } from "./identitySignals";

export {
  attachEvidence,
  getEvidenceForObject,
  requireEvidenceExcerpt,
  WORLD_SOURCE_TYPES,
} from "./provenance";

export {
  scoreEntityImportance,
  scoreTimelineImportance,
  TIMELINE_IMPORTANCE_THRESHOLD,
} from "./importance";

export {
  emitWorldTimelineEntry,
  inferTimelineEntriesFromExtraction,
} from "./timeline";

export {
  createWorldInboxItem,
  applyInboxCorrection,
  listPendingInboxItems,
} from "./inbox";

export {
  filterEntitiesByAuthorizedSpaces,
  listWorldEntitiesVisible,
  entityHasAuthorizedEvidence,
} from "./auth";

export { processWorldExtraction } from "./engine";
