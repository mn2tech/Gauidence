import {
  formatAgencies,
  formatNaicsList,
  formatSmallBusinessStatuses,
} from "@/lib/leads/research/normalize";
import type {
  LeadResearchSnapshot,
  ResearchChecklist,
  ResearchConfidence,
  ResearchFact,
  ResearchSummaryCounts,
} from "@/lib/leads/research/types";

export function emptyFact<T>(value: T): ResearchFact<T> {
  return {
    value,
    confidence: "not_found",
    source: "",
    sourceType: "other",
    sourceUrl: null,
    verifiedAt: null,
  };
}

export function makeFact<T>(
  value: T,
  confidence: ResearchConfidence,
  source: string,
  sourceType: ResearchFact["sourceType"],
  sourceUrl?: string | null,
  notes?: string | null
): ResearchFact<T> {
  const hasValue =
    value != null &&
    !(typeof value === "string" && !value.trim()) &&
    !(Array.isArray(value) && value.length === 0);
  return {
    value,
    confidence: hasValue ? confidence : "not_found",
    source: hasValue ? source : "",
    sourceType,
    sourceUrl: sourceUrl ?? null,
    verifiedAt: confidence === "verified" ? new Date().toISOString() : null,
    notes: notes ?? null,
  };
}

export function summarizeFacts(
  facts: Record<string, ResearchFact>
): ResearchSummaryCounts {
  let populated = 0;
  let verified = 0;
  let needsReview = 0;
  let notFound = 0;
  for (const fact of Object.values(facts)) {
    if (fact.confidence === "not_found") {
      notFound += 1;
      continue;
    }
    populated += 1;
    if (fact.confidence === "verified") verified += 1;
    else if (fact.confidence === "medium" || fact.confidence === "low") {
      needsReview += 1;
    }
  }
  return { populated, verified, needsReview, notFound };
}

export function buildChecklist(snapshot: {
  companyName: string;
  uei: string;
  cageCode: string;
  naics: unknown[];
  agencies: unknown[];
  vehicles: unknown[];
  contracts: unknown[];
  facts: Record<string, ResearchFact>;
}): ResearchChecklist {
  const ueiFact = snapshot.facts.uei;
  const cageFact = snapshot.facts.cageCode;
  return {
    companyIdentified: Boolean(snapshot.companyName.trim()),
    ueiVerified: ueiFact?.confidence === "verified" && Boolean(snapshot.uei),
    cageVerified: cageFact?.confidence === "verified" && Boolean(snapshot.cageCode),
    naicsCount: snapshot.naics.length,
    agencyCount: snapshot.agencies.length,
    vehicleCount: snapshot.vehicles.length,
    contractsFound: snapshot.contracts.length > 0,
    partnerFitCalculated: true,
  };
}

export function denormalizeSnapshot(snapshot: LeadResearchSnapshot): {
  company_name: string | null;
  legal_company_name: string | null;
  website: string | null;
  linkedin_url: string | null;
  headquarters: string | null;
  address: string | null;
  company_description: string | null;
  market_agency: string | null;
  small_business_status: string | null;
  uei: string | null;
  cage_code: string | null;
  naics_codes: string | null;
  primary_naics: string | null;
  primary_capabilities: string | null;
  federal_agencies_served: string | null;
  contract_vehicles: string | null;
  known_contracts: string | null;
  current_opportunities: string | null;
  past_performance_areas: string | null;
  technology_areas: string | null;
  recommended_outreach_angle: string | null;
  why_company_matters: string | null;
  nm2tech_can_bring: string | null;
  match_explanation: string | null;
  recommended_approach: string | null;
  lead_score: number | null;
} {
  const primary = snapshot.naics.find((n) => n.isPrimary);
  const opportunitiesText =
    snapshot.opportunitiesVerified && snapshot.opportunities.length === 0
      ? "No current opportunities verified"
      : snapshot.opportunities
          .map((o) =>
            [o.title, o.noticeNumber, o.agency].filter(Boolean).join(" · ")
          )
          .join("; ") || null;

  return {
    company_name: snapshot.companyName || null,
    legal_company_name: snapshot.legalCompanyName || null,
    website: snapshot.website || null,
    linkedin_url: snapshot.linkedinUrl || null,
    headquarters: snapshot.headquarters || null,
    address: snapshot.headquarters || null,
    company_description: snapshot.companyDescription || null,
    market_agency:
      snapshot.marketAgency ||
      snapshot.agencies.slice(0, 3).map((a) => a.name).join(", ") ||
      null,
    small_business_status:
      formatSmallBusinessStatuses(snapshot.smallBusinessStatuses) || null,
    uei: snapshot.uei || null,
    cage_code: snapshot.cageCode || null,
    naics_codes: formatNaicsList(snapshot.naics) || null,
    primary_naics: primary ? `${primary.code}${primary.title ? ` — ${primary.title}` : ""}` : null,
    primary_capabilities: snapshot.capabilityTags.join(", ") || null,
    federal_agencies_served: formatAgencies(snapshot.agencies) || null,
    contract_vehicles:
      snapshot.vehicles
        .map((v) =>
          [v.name, v.contractNumber, v.vehicleType].filter(Boolean).join(" · ")
        )
        .join("; ") || null,
    known_contracts:
      snapshot.contracts
        .map((c) =>
          [c.name || c.contractNumber, c.agency, c.role].filter(Boolean).join(" · ")
        )
        .join("; ") || null,
    current_opportunities: opportunitiesText,
    past_performance_areas: snapshot.pastPerformanceTags.join(", ") || null,
    technology_areas: snapshot.technologyTags.join(", ") || null,
    recommended_outreach_angle: snapshot.partnerFit.outreachAngle || null,
    why_company_matters: snapshot.partnerFit.whyCompanyMatters || null,
    nm2tech_can_bring: snapshot.partnerFit.nm2techCanBring.join(", ") || null,
    match_explanation: snapshot.partnerFit.whyCompanyMatters || null,
    recommended_approach: snapshot.partnerFit.outreachAngle || null,
    lead_score: snapshot.partnerFit.score,
  };
}
