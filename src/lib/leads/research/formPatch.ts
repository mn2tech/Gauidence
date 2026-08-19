import {
  formatAgencies,
  formatNaicsList,
  formatSmallBusinessStatuses,
} from "@/lib/leads/research/normalize";
import type { BusinessLead } from "@/lib/leads/types";
import type { LeadResearchSnapshot, PartnerFitResult } from "@/lib/leads/research/types";

export function snapshotFromLead(lead: BusinessLead): LeadResearchSnapshot | null {
  const data = (lead.federal_profile_data ?? {}) as Partial<LeadResearchSnapshot> &
    Record<string, unknown>;
  const fit = lead.partner_fit as PartnerFitResult | null | undefined;
  if (!fit && !lead.last_researched_at && Object.keys(data).length === 0) {
    return null;
  }
  return {
    mode: "full",
    researchedAt: lead.last_researched_at ?? lead.updated_at,
    query: { companyName: lead.company_name ?? "", website: lead.website ?? "" },
    companyName: lead.company_name ?? "",
    legalCompanyName: lead.legal_company_name ?? "",
    website: lead.website ?? "",
    linkedinUrl: lead.linkedin_url ?? "",
    headquarters: lead.headquarters ?? "",
    companyDescription: lead.company_description ?? "",
    marketAgency: lead.market_agency ?? "",
    smallBusinessStatuses: Array.isArray(data.smallBusinessStatuses)
      ? data.smallBusinessStatuses
      : (lead.small_business_status ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
    uei: lead.uei ?? "",
    cageCode: lead.cage_code ?? "",
    naics: Array.isArray(data.naics) ? data.naics : [],
    capabilityTags: Array.isArray(data.capabilityTags) ? data.capabilityTags : [],
    agencies: Array.isArray(data.agencies) ? data.agencies : [],
    vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
    contracts: Array.isArray(data.contracts) ? data.contracts : [],
    opportunities: Array.isArray(data.opportunities) ? data.opportunities : [],
    opportunitiesVerified: data.opportunitiesVerified !== false,
    pastPerformanceTags: Array.isArray(data.pastPerformanceTags)
      ? data.pastPerformanceTags
      : [],
    technologyTags: Array.isArray(data.technologyTags) ? data.technologyTags : [],
    suggestedRelationshipOwner:
      (data.suggestedRelationshipOwner as LeadResearchSnapshot["suggestedRelationshipOwner"]) ??
      null,
    partnerFit: fit ?? {
      score: lead.lead_score ?? 0,
      priority: "Low",
      relationshipType: "",
      whyCompanyMatters: lead.why_company_matters ?? "",
      nm2techCanBring: (lead.nm2tech_can_bring ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      outreachAngle: lead.recommended_outreach_angle ?? "",
      signals: [],
    },
    facts: (data.facts as LeadResearchSnapshot["facts"]) ?? {},
    checklist: (data.checklist as LeadResearchSnapshot["checklist"]) ?? {
      companyIdentified: Boolean(lead.company_name),
      ueiVerified: false,
      cageVerified: false,
      naicsCount: 0,
      agencyCount: 0,
      vehicleCount: 0,
      contractsFound: false,
      partnerFitCalculated: Boolean(fit),
    },
    summary: (lead.research_summary as LeadResearchSnapshot["summary"]) ?? {
      populated: 0,
      verified: 0,
      needsReview: 0,
      notFound: 0,
    },
    sourcesUsed: [],
  };
}

export type ResearchFormPatch = {
  companyName: string;
  legalCompanyName: string;
  website: string;
  linkedinUrl: string;
  headquarters: string;
  companyDescription: string;
  marketAgency: string;
  smallBusinessStatuses: string[];
  uei: string;
  cageCode: string;
  naicsCodes: string;
  primaryCapabilities: string;
  federalAgenciesServed: string;
  contractVehicles: string;
  knownContracts: string;
  currentOpportunities: string;
  pastPerformanceAreas: string;
  technologyAreas: string;
  recommendedOutreachAngle: string;
  whyCompanyMatters: string;
  nm2techCanBring: string;
  relationshipOwner: string;
};

export function snapshotToFormPatch(
  snapshot: LeadResearchSnapshot,
  opts?: { confirmOwner?: boolean }
): ResearchFormPatch {
  const opportunities =
    snapshot.opportunitiesVerified && snapshot.opportunities.length === 0
      ? "No current opportunities verified"
      : snapshot.opportunities
          .map((o) => [o.title, o.noticeNumber].filter(Boolean).join(" · "))
          .join("\n");

  return {
    companyName: snapshot.companyName,
    legalCompanyName: snapshot.legalCompanyName,
    website: snapshot.website,
    linkedinUrl: snapshot.linkedinUrl,
    headquarters: snapshot.headquarters,
    companyDescription: snapshot.companyDescription,
    marketAgency: snapshot.marketAgency || snapshot.agencies[0]?.name || "",
    smallBusinessStatuses: snapshot.smallBusinessStatuses,
    uei: snapshot.uei,
    cageCode: snapshot.cageCode,
    naicsCodes: formatNaicsList(snapshot.naics),
    primaryCapabilities: snapshot.capabilityTags.join(", "),
    federalAgenciesServed: formatAgencies(snapshot.agencies),
    contractVehicles: snapshot.vehicles
      .map((v) => [v.name, v.contractNumber, v.vehicleType].filter(Boolean).join(" · "))
      .join("\n"),
    knownContracts: snapshot.contracts
      .map((c) => [c.name || c.contractNumber, c.agency, c.role].filter(Boolean).join(" · "))
      .join("\n"),
    currentOpportunities: opportunities,
    pastPerformanceAreas: snapshot.pastPerformanceTags.join(", "),
    technologyAreas: snapshot.technologyTags.join(", "),
    recommendedOutreachAngle: snapshot.partnerFit.outreachAngle,
    whyCompanyMatters: snapshot.partnerFit.whyCompanyMatters,
    nm2techCanBring: snapshot.partnerFit.nm2techCanBring.join(", "),
    relationshipOwner:
      opts?.confirmOwner && snapshot.suggestedRelationshipOwner
        ? snapshot.suggestedRelationshipOwner.name
        : "",
  };
}

export function joinTags(value: string): string[] {
  return value
    .split(/[;,\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export { formatSmallBusinessStatuses, formatNaicsList, formatAgencies };
