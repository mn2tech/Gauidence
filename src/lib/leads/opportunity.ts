export type LeadEvidenceKind = "observed" | "inferred" | "unknown";

export type LeadPotentialNeed = {
  label: string;
  kind: LeadEvidenceKind;
  detail: string;
};

export type LeadOpportunityBrief = {
  companySummary: string;
  primaryNeed: string;
  potentialNeeds: LeadPotentialNeed[];
  recommendedService: string;
  reasoning: string;
  conversationAngle: string;
  suggestedOpening: string;
  leadScore: number;
  nextBestAction: string;
  analyzedAt?: string;
};

export function isLeadEvidenceKind(value: string): value is LeadEvidenceKind {
  return value === "observed" || value === "inferred" || value === "unknown";
}

export const EVIDENCE_KIND_LABELS: Record<LeadEvidenceKind, string> = {
  observed: "Observed",
  inferred: "Inferred",
  unknown: "Unknown",
};
