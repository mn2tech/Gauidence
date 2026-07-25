import type { GuardianAnalysis } from "@/lib/analysis/types";

/** Structured analysis fields passed into the Knowledge Engine (no raw document text). */
export type DocumentAnalysisContext = {
  documentType: string;
  title: string;
  summary: string;
  guardianStatus: string;
  overallConfidence: number;
  people: string[];
  organizations: string[];
  obligations: string[];
  suggestedActions: string[];
  warnings: string[];
  importantDates: Array<{
    label: string;
    value: string;
    date?: string | null;
    isDeadline?: boolean;
    confidence: number;
  }>;
  amounts: Array<{
    label: string;
    value: string;
    confidence: number;
  }>;
};

export function buildDocumentAnalysisContext(
  analysis: GuardianAnalysis
): DocumentAnalysisContext {
  return {
    documentType: analysis.document_type,
    title: analysis.title,
    summary: analysis.summary,
    guardianStatus: analysis.guardian_status,
    overallConfidence: analysis.overall_confidence,
    people: analysis.people,
    organizations: analysis.organizations,
    obligations: analysis.obligations,
    suggestedActions: analysis.suggested_actions,
    warnings: analysis.warnings,
    importantDates: analysis.important_dates.map((d) => ({
      label: d.label,
      value: d.value,
      date: d.date,
      isDeadline: d.is_deadline,
      confidence: d.confidence,
    })),
    amounts: analysis.amounts.map((a) => ({
      label: a.label,
      value: a.value,
      confidence: a.confidence,
    })),
  };
}
