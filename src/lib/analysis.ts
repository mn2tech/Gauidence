/** Shared types for AI document analysis. */

export type FactSource = "document" | "calculated" | "ai_generated";

export type Fact = {
  label: string;
  value: string;
  source: FactSource;
  /** ISO date (YYYY-MM-DD) when the fact refers to a specific date. */
  date: string | null;
};

export type AnalysisResult = {
  summary: string;
  facts: Fact[];
  model: string;
  analyzedAt: string;
};

export const SOURCE_LABELS: Record<FactSource, string> = {
  document: "From your document",
  calculated: "Calculated",
  ai_generated: "AI suggestion",
};
