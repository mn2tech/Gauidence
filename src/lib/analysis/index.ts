/** Public re-exports for UI and API compatibility. */
export type {
  Fact,
  FactSource,
  AnalysisResult,
  DocumentType,
  GuardianStatus,
  AnalysisStatus,
  GuardianAnalysis,
  Classification,
  ExtractedFact,
} from "./types";

export {
  SOURCE_LABELS,
  ANALYSIS_STATUS_LABELS,
  GUARDIAN_STATUS_LABELS,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  CLASSIFY_ROUTE_THRESHOLD,
  IMPLEMENTED_SPECIALISTS,
  mapSourceType,
  confidenceBand,
} from "./types";

export { formatDateRelativeLabel, daysRelativeTo, formatDisplayDate } from "./dates";
export { validateAnalysis, deriveGuardianStatus } from "./validate";
export { toDisplayFacts, collectDeadlines } from "./display";
export { resolveAnalyzerType } from "./route";
