/**
 * Guardian Events — History / temporal intelligence layer.
 * Phase 1: schema, types, auth, repository, provenance.
 */

export type {
  CreateGuardianEventInput,
  GuardianEvent,
  GuardianEventCreatedBy,
  GuardianEventMetadata,
  GuardianEventSourceType,
  GuardianEventStatus,
  GuardianEventType,
  ListGuardianEventsFilter,
} from "./types";

export {
  GUARDIAN_EVENT_CREATED_BY,
  GUARDIAN_EVENT_SOURCE_TYPES,
  GUARDIAN_EVENT_STATUSES,
  GUARDIAN_EVENT_TYPES,
  isGuardianEventStatus,
  isGuardianEventType,
} from "./types";

export {
  canReadGuardianEvent,
  canWriteGuardianEventSpace,
  filterReadableGuardianEvents,
  resolveAuthorizedSpaceIds,
  resolveEditableSpaceIds,
} from "./auth";

export {
  buildGuardianEventDedupeKey,
  dailyLogEntryDedupeKey,
} from "./dedupe";

export {
  formatGuardianEventSourceLabel,
  getGuardianEventSourceRef,
} from "./provenance";

export {
  groupGuardianEventsByDate,
  sortGuardianEventsByOccurredAt,
} from "./sort";

export {
  deriveGuardianEventsFromDailyLog,
  isPrimaryDailyLogEvent,
} from "./fromDailyLog";
export type { DailyLogForEvents } from "./fromDailyLog";

export {
  deriveEventsFromTellGuardian,
  suggestSpaceIdFromText,
} from "./tellGuardian";

export {
  HISTORY_FILTERS,
  buildHistoryTimeline,
  eventMatchesHistoryFilter,
  formatHistoryDayHeading,
  historyEventTypeLabel,
  isHistoryFilter,
  toHistoryEventCard,
} from "./history";
export type { HistoryEventCard, HistoryFilter } from "./history";

export { createMemoryGuardianEventStore } from "./memoryStore";
export type { MemoryGuardianEventStore, MemoryEventAuth } from "./memoryStore";

export { syncGuardianEventsFromDailyLogMemory } from "./syncFromDailyLogMemory";
