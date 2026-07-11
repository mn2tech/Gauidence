/** Shared types for routed Guardian document analysis. */

export type FactSource =
  | "document"
  | "calculated"
  | "ai_generated"
  | "ai_suggestion"
  | "user_confirmed";

/** UI / legacy display fact (compatible with existing dashboard). */
export type Fact = {
  label: string;
  value: string;
  source: "document" | "calculated" | "ai_generated";
  date: string | null;
  confidence?: number;
  needs_verification?: boolean;
  source_excerpt?: string;
  page_number?: number | null;
};

export type AnalysisResult = {
  summary: string;
  facts: Fact[];
  model: string;
  analyzedAt: string;
};

export const SOURCE_LABELS: Record<"document" | "calculated" | "ai_generated", string> = {
  document: "From your document",
  calculated: "Calculated",
  ai_generated: "AI suggestion",
};

export type DocumentType =
  | "invoice"
  | "insurance"
  | "contract"
  | "receipt"
  | "passport"
  | "drivers_license"
  | "warranty"
  | "tax_document"
  | "general";

export type GuardianStatus =
  | "protected"
  | "upcoming"
  | "action_needed"
  | "needs_verification";

export type AnalysisStatus =
  | "uploaded"
  | "extracting"
  | "classifying"
  | "analyzing"
  | "validating"
  | "completed"
  | "failed"
  | "needs_verification";

export type Classification = {
  document_type: DocumentType;
  document_subtype: string;
  classification_confidence: number;
  classification_reason: string;
};

export type ExtractedFact = {
  label: string;
  value: string;
  source_type: "document" | "calculated" | "ai_suggestion" | "user_confirmed";
  confidence: number;
  source_excerpt: string;
  page_number: number | null;
  needs_verification: boolean;
  /** ISO date when this fact is a calendar date. */
  date?: string | null;
  /** True when this date is an action deadline (due, renewal, expiration). */
  is_deadline?: boolean;
  /** True when this date is a historical/event date (invoice date, effective start). */
  is_past_event?: boolean;
};

export type GuardianAnalysis = {
  document_type: DocumentType;
  title: string;
  summary: string;
  facts: ExtractedFact[];
  important_dates: ExtractedFact[];
  people: string[];
  organizations: string[];
  amounts: ExtractedFact[];
  obligations: string[];
  warnings: string[];
  guardian_status: GuardianStatus;
  suggested_actions: string[];
  overall_confidence: number;
  specialist: Record<string, unknown>;
};

export const CONFIDENCE_HIGH = 0.9;
export const CONFIDENCE_MEDIUM = 0.75;
export const CLASSIFY_ROUTE_THRESHOLD = 0.8;

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  uploaded: "Upload complete",
  extracting: "Reading document",
  classifying: "Identifying document type",
  analyzing: "Extracting important details",
  validating: "Checking dates and amounts",
  completed: "Analysis ready",
  failed: "Analysis failed",
  needs_verification: "Needs verification",
};

export const GUARDIAN_STATUS_LABELS: Record<GuardianStatus, string> = {
  protected: "Protected",
  upcoming: "Upcoming",
  action_needed: "Action needed",
  needs_verification: "Needs verification",
};

/** Specialist types fully implemented; others fall back to general. */
export const IMPLEMENTED_SPECIALISTS: DocumentType[] = [
  "invoice",
  "insurance",
  "contract",
  "receipt",
];

export function mapSourceType(
  source: ExtractedFact["source_type"]
): Fact["source"] {
  if (source === "calculated") return "calculated";
  if (source === "ai_suggestion" || source === "user_confirmed") return "ai_generated";
  return "document";
}

export function confidenceBand(confidence: number): "high" | "medium" | "needs_verification" {
  if (confidence >= CONFIDENCE_HIGH) return "high";
  if (confidence >= CONFIDENCE_MEDIUM) return "medium";
  return "needs_verification";
}
