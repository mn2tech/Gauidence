export const SUMMIT_SOURCE_TYPES = [
  "summit",
  "public",
  "community",
  "guardian_insight",
] as const;

export type SummitSourceType = (typeof SUMMIT_SOURCE_TYPES)[number];

export const SUMMIT_SOURCE_LABELS: Record<SummitSourceType, string> = {
  summit: "VERIFIED SUMMIT INFORMATION",
  public: "PUBLICLY VERIFIED INFORMATION",
  community: "COMMUNITY CONTRIBUTION",
  guardian_insight: "GUARDIAN INSIGHT",
};

export function formatSourceAttribution(sourceType: string): string {
  if (sourceType === "public") return SUMMIT_SOURCE_LABELS.public;
  if (sourceType === "community") return SUMMIT_SOURCE_LABELS.community;
  if (sourceType === "guardian_insight") return SUMMIT_SOURCE_LABELS.guardian_insight;
  return SUMMIT_SOURCE_LABELS.summit;
}

export const OPPORTUNITY_TYPES = [
  "Subcontracting",
  "Teaming",
  "Prime Contractor Outreach",
  "Small Business Program",
  "Contract Vehicle",
  "Agency Engagement",
  "Upcoming Procurement",
  "Business Development",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
