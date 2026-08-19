import {
  formatAgencies,
  formatNaicsList,
  formatSmallBusinessStatuses,
} from "@/lib/leads/research/normalize";
import type {
  FieldDecision,
  LeadResearchSnapshot,
  ResearchFieldConflict,
} from "@/lib/leads/research/types";

export type ExistingLeadFields = {
  companyName?: string | null;
  legalCompanyName?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  headquarters?: string | null;
  companyDescription?: string | null;
  marketAgency?: string | null;
  smallBusinessStatus?: string | null;
  uei?: string | null;
  cageCode?: string | null;
  naicsCodes?: string | null;
  primaryCapabilities?: string | null;
  federalAgenciesServed?: string | null;
  contractVehicles?: string | null;
  knownContracts?: string | null;
  currentOpportunities?: string | null;
  pastPerformanceAreas?: string | null;
  technologyAreas?: string | null;
  relationshipOwner?: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  companyName: "Company name",
  legalCompanyName: "Legal company name",
  website: "Website",
  linkedinUrl: "LinkedIn",
  headquarters: "Headquarters",
  companyDescription: "Company description",
  marketAgency: "Market / Agency",
  smallBusinessStatuses: "Small business status",
  uei: "UEI",
  cageCode: "CAGE code",
  naics: "NAICS codes",
  capabilityTags: "Primary capabilities",
  agencies: "Federal agencies served",
  vehicles: "Contract vehicles",
  contracts: "Known contracts",
  opportunities: "Current opportunities",
  pastPerformanceTags: "Past-performance areas",
  technologyTags: "Technology areas",
};

function researchedText(
  snapshot: LeadResearchSnapshot,
  field: keyof typeof FIELD_LABELS
): string {
  switch (field) {
    case "companyName":
      return snapshot.companyName;
    case "legalCompanyName":
      return snapshot.legalCompanyName;
    case "website":
      return snapshot.website;
    case "linkedinUrl":
      return snapshot.linkedinUrl;
    case "headquarters":
      return snapshot.headquarters;
    case "companyDescription":
      return snapshot.companyDescription;
    case "marketAgency":
      return snapshot.marketAgency;
    case "smallBusinessStatuses":
      return formatSmallBusinessStatuses(snapshot.smallBusinessStatuses);
    case "uei":
      return snapshot.uei;
    case "cageCode":
      return snapshot.cageCode;
    case "naics":
      return formatNaicsList(snapshot.naics);
    case "capabilityTags":
      return snapshot.capabilityTags.join(", ");
    case "agencies":
      return formatAgencies(snapshot.agencies);
    case "vehicles":
      return snapshot.vehicles
        .map((v) => [v.name, v.contractNumber].filter(Boolean).join(" · "))
        .join("; ");
    case "contracts":
      return snapshot.contracts
        .map((c) => [c.name || c.contractNumber, c.agency].filter(Boolean).join(" · "))
        .join("; ");
    case "opportunities":
      if (!snapshot.opportunitiesVerified || snapshot.opportunities.length === 0) {
        return snapshot.opportunitiesVerified
          ? "No current opportunities verified"
          : "";
      }
      return snapshot.opportunities.map((o) => o.title).join("; ");
    case "pastPerformanceTags":
      return snapshot.pastPerformanceTags.join(", ");
    case "technologyTags":
      return snapshot.technologyTags.join(", ");
    default:
      return "";
  }
}

function existingText(
  existing: ExistingLeadFields,
  field: keyof typeof FIELD_LABELS
): string {
  switch (field) {
    case "companyName":
      return existing.companyName?.trim() ?? "";
    case "legalCompanyName":
      return existing.legalCompanyName?.trim() ?? "";
    case "website":
      return existing.website?.trim() ?? "";
    case "linkedinUrl":
      return existing.linkedinUrl?.trim() ?? "";
    case "headquarters":
      return existing.headquarters?.trim() ?? "";
    case "companyDescription":
      return existing.companyDescription?.trim() ?? "";
    case "marketAgency":
      return existing.marketAgency?.trim() ?? "";
    case "smallBusinessStatuses":
      return existing.smallBusinessStatus?.trim() ?? "";
    case "uei":
      return existing.uei?.trim() ?? "";
    case "cageCode":
      return existing.cageCode?.trim() ?? "";
    case "naics":
      return existing.naicsCodes?.trim() ?? "";
    case "capabilityTags":
      return existing.primaryCapabilities?.trim() ?? "";
    case "agencies":
      return existing.federalAgenciesServed?.trim() ?? "";
    case "vehicles":
      return existing.contractVehicles?.trim() ?? "";
    case "contracts":
      return existing.knownContracts?.trim() ?? "";
    case "opportunities":
      return existing.currentOpportunities?.trim() ?? "";
    case "pastPerformanceTags":
      return existing.pastPerformanceAreas?.trim() ?? "";
    case "technologyTags":
      return existing.technologyAreas?.trim() ?? "";
    default:
      return "";
  }
}

function comparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function canMerge(field: string): boolean {
  return [
    "naics",
    "capabilityTags",
    "agencies",
    "vehicles",
    "contracts",
    "opportunities",
    "pastPerformanceTags",
    "technologyTags",
    "smallBusinessStatuses",
  ].includes(field);
}

function mergeValues(existing: string, researched: string, field: string): string {
  if (field === "naics" || field === "smallBusinessStatuses" || field.endsWith("Tags") || field === "agencies") {
    const parts = `${existing}; ${researched}`
      .split(/[;,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of parts) {
      const key = comparable(part);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
    return out.join(field === "naics" ? "\n" : ", ");
  }
  if (existing.includes(researched) || researched.includes(existing)) {
    return existing.length >= researched.length ? existing : researched;
  }
  return `${existing}; ${researched}`;
}

export function detectResearchConflicts(
  existing: ExistingLeadFields,
  snapshot: LeadResearchSnapshot
): ResearchFieldConflict[] {
  const conflicts: ResearchFieldConflict[] = [];
  for (const field of Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>) {
    const current = existingText(existing, field);
    const found = researchedText(snapshot, field);
    if (!current || !found) continue;
    if (comparable(current) === comparable(found)) continue;
    conflicts.push({
      field,
      label: FIELD_LABELS[field],
      existing: current,
      researched: found,
      mergeValue: canMerge(field) ? mergeValues(current, found, field) : null,
    });
  }
  return conflicts;
}

export function researchedFieldText(
  snapshot: LeadResearchSnapshot,
  field: string
): string {
  return researchedText(snapshot, field as keyof typeof FIELD_LABELS);
}

export function applyFieldDecision(
  existing: string,
  researched: string,
  decision: FieldDecision,
  mergeValue?: string | null
): string {
  if (decision === "keep") return existing;
  if (decision === "merge") return mergeValue || mergeValues(existing, researched, "");
  return researched;
}

export { FIELD_LABELS };
