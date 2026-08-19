import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractResearchNarrative } from "@/lib/leads/research/extract";
import { buildChecklist, emptyFact, makeFact, summarizeFacts } from "@/lib/leads/research/facts";
import {
  mergeAgencies,
  normalizeWebsite,
  parseNaicsList,
  websiteDomain,
} from "@/lib/leads/research/normalize";
import { computePartnerFit, pickSuggestedOwner } from "@/lib/leads/research/partnerFit";
import { loadSamPacket, samEntitiesToCandidates } from "@/lib/leads/research/sources/sam";
import { loadUsaSpendingPacket } from "@/lib/leads/research/sources/usaspending";
import { loadWebResearchPacket } from "@/lib/leads/research/sources/web";
import type {
  LeadResearchSnapshot,
  ResearchCandidate,
  ResearchFact,
  ResearchMode,
  ResearchResult,
  SuggestedOwner,
} from "@/lib/leads/research/types";

export type RunLeadResearchArgs = {
  supabase: SupabaseClient;
  userId: string;
  businessProfileId: string;
  companyName: string;
  website?: string;
  mode?: ResearchMode;
  selectedUei?: string | null;
  selectedHash?: string | null;
  selectedLegalName?: string | null;
};

function uniqueCandidates(list: ResearchCandidate[]): ResearchCandidate[] {
  const seen = new Set<string>();
  const out: ResearchCandidate[] = [];
  for (const item of list) {
    const key = (item.uei || item.legalName).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function needsDisambiguation(
  candidates: ResearchCandidate[],
  website: string,
  selectedUei?: string | null
): boolean {
  if (selectedUei) return false;
  const withUei = candidates.filter((c) => c.uei);
  if (withUei.length <= 1) return false;
  const distinct = new Set(withUei.map((c) => c.uei));
  if (distinct.size <= 1) return false;
  if (website) {
    const domain = websiteDomain(website);
    const matching = withUei.filter(
      (c) => c.website && websiteDomain(c.website) === domain
    );
    if (matching.length === 1) return false;
  }
  return distinct.size > 1;
}

async function findSuggestedOwner(
  supabase: SupabaseClient,
  businessProfileId: string,
  query: { companyName: string; website: string }
): Promise<SuggestedOwner | null> {
  const { data } = await supabase
    .from("business_leads")
    .select("company_name, website, relationship_owner")
    .eq("business_profile_id", businessProfileId)
    .not("relationship_owner", "is", null)
    .limit(80);
  const rows = (data ?? []).map((row) => ({
    companyName: (row.company_name as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    owner: (row.relationship_owner as string | null) ?? null,
  }));
  return pickSuggestedOwner(rows, query);
}

export async function runLeadCompanyResearch(
  args: RunLeadResearchArgs
): Promise<ResearchResult> {
  const companyName = args.companyName.trim();
  const websiteHint = normalizeWebsite(args.website ?? "");
  const mode: ResearchMode = args.mode === "refresh" ? "refresh" : "full";
  if (!companyName && !websiteHint) {
    throw new Error("Enter a company name or website to research.");
  }

  const domain = websiteDomain(websiteHint);
  const queryName =
    companyName ||
    (domain ? domain.replace(/\.(com|net|org|io|us|gov|co)$/i, "") : "") ||
    "company";

  const [{ data: workspace }, suggestedOwner, usa, sam, web] = await Promise.all([
    args.supabase
      .from("guardian_profiles")
      .select("display_name, business_legal_name, description, website")
      .eq("id", args.businessProfileId)
      .maybeSingle(),
    findSuggestedOwner(args.supabase, args.businessProfileId, {
      companyName: queryName,
      website: websiteHint,
    }),
    loadUsaSpendingPacket({
      companyName: args.selectedLegalName || queryName,
      selectedHash: args.selectedHash,
      selectedUei: args.selectedUei,
    }),
    loadSamPacket({
      companyName: args.selectedLegalName || queryName,
      uei: args.selectedUei,
    }),
    loadWebResearchPacket({
      companyName: queryName,
      website: websiteHint,
    }),
  ]);

  const candidates = uniqueCandidates([
    ...samEntitiesToCandidates(sam.entities),
    ...usa.recipients,
  ]);

  if (needsDisambiguation(candidates, websiteHint, args.selectedUei)) {
    return {
      status: "needs_disambiguation",
      candidates,
      query: { companyName: queryName, website: websiteHint },
    };
  }

  const samEntity =
    sam.entities.find((e) => args.selectedUei && e.uei === args.selectedUei) ??
    sam.entities[0] ??
    null;
  const usaSelected = usa.selected;

  const legalName =
    args.selectedLegalName ||
    samEntity?.legalName ||
    usaSelected?.legalName ||
    queryName;
  const website =
    normalizeWebsite(samEntity?.website || web.officialWebsite || websiteHint) ||
    web.discovery?.finalUrl ||
    "";
  const uei = samEntity?.uei || usaSelected?.uei || "";
  const cageCode = samEntity?.cageCode || "";
  const headquarters =
    samEntity?.headquarters || usaSelected?.location || "";
  const naics = parseNaicsList(
    [
      ...(samEntity?.naics ?? []),
      ...usa.naics.map((n) => ({ code: n.code, title: n.title, isPrimary: false })),
    ],
    samEntity?.naics.find((n) => n.isPrimary)?.code
  );
  const agencies = mergeAgencies(usa.agencies);
  const sbFromSam = samEntity?.smallBusinessStatuses ?? [];
  const vehicles = usa.vehicles;
  const contracts = usa.awards;
  const opportunities = sam.configured ? sam.opportunities : [];
  const opportunitiesVerified = sam.configured;

  const narrative = await extractResearchNarrative({
    userId: args.userId,
    companyName: legalName,
    workspaceName:
      (workspace?.business_legal_name as string) ||
      (workspace?.display_name as string) ||
      "NM2TECH",
    samJson: JSON.stringify({
      configured: sam.configured,
      entity: samEntity,
      error: sam.error,
    }),
    usaJson: JSON.stringify({
      selected: usaSelected,
      vehicles,
      awards: contracts.slice(0, 12),
      agencies: usa.agencies.slice(0, 20),
      error: usa.error,
    }),
    webBlock: web.promptBlock,
    discovery: web.discovery,
    discoveryError: web.discoveryError,
  });

  const capabilityTags = narrative?.capabilityTags ?? [];
  const pastPerformanceTags = narrative?.pastPerformanceTags ?? [];
  const technologyTags = narrative?.technologyTags ?? [];
  const description =
    narrative?.description ||
    web.discovery?.metaDescription ||
    "";
  const linkedinUrl = narrative?.linkedinUrl || web.linkedinUrl || "";
  const workspaceName =
    (workspace?.business_legal_name as string) ||
    (workspace?.display_name as string) ||
    "NM2TECH";

  const partnerFit = computePartnerFit({
    workspaceName,
    agencies,
    capabilities: capabilityTags,
    technologies: technologyTags,
    naics,
    vehicles,
    contracts,
    opportunities,
    smallBusinessStatuses: sbFromSam,
    headquarters,
    suggestedOwner,
    companyName: legalName,
  });

  if (narrative?.whyCompanyMatters) {
    partnerFit.whyCompanyMatters = narrative.whyCompanyMatters;
  }
  if (narrative?.nm2techCanBring?.length) {
    partnerFit.nm2techCanBring = narrative.nm2techCanBring;
  }
  if (narrative?.outreachAngle) {
    partnerFit.outreachAngle = narrative.outreachAngle;
  }

  const now = new Date().toISOString();
  const facts: Record<string, ResearchFact> = {
    companyName: makeFact(
      legalName,
      samEntity ? "verified" : usaSelected ? "high" : "medium",
      samEntity ? "SAM.gov entity registration" : usaSelected ? "USASpending.gov" : "Company website / search",
      samEntity ? "sam.gov" : usaSelected ? "usaspending.gov" : "company_website",
      samEntity?.sourceUrl ?? "https://www.usaspending.gov"
    ),
    legalCompanyName: samEntity
      ? makeFact(samEntity.legalName, "verified", "SAM.gov legal business name", "sam.gov", samEntity.sourceUrl)
      : usaSelected
        ? makeFact(usaSelected.legalName, "high", "USASpending.gov recipient", "usaspending.gov", "https://www.usaspending.gov")
        : emptyFact(""),
    website: website
      ? makeFact(
          website,
          samEntity?.website ? "high" : web.discovery ? "medium" : "low",
          samEntity?.website ? "SAM.gov entity URL" : "Website fetch / web search",
          samEntity?.website ? "sam.gov" : "company_website",
          website
        )
      : emptyFact(""),
    linkedinUrl: linkedinUrl
      ? makeFact(linkedinUrl, "medium", "LinkedIn company profile (web search)", "linkedin", linkedinUrl)
      : emptyFact(""),
    headquarters: headquarters
      ? makeFact(
          headquarters,
          samEntity ? "verified" : "high",
          samEntity ? "SAM.gov physical address" : "USASpending.gov",
          samEntity ? "sam.gov" : "usaspending.gov",
          samEntity?.sourceUrl ?? null
        )
      : emptyFact(""),
    companyDescription: description
      ? makeFact(
          description,
          web.discovery ? "medium" : "low",
          web.discovery ? "Company website" : "Research synthesis",
          "company_website",
          website || null
        )
      : emptyFact(""),
    uei: uei
      ? makeFact(
          uei,
          samEntity ? "verified" : "high",
          samEntity ? "SAM.gov UEI" : "USASpending.gov recipient UEI",
          samEntity ? "sam.gov" : "usaspending.gov",
          samEntity?.sourceUrl ?? "https://www.usaspending.gov"
        )
      : emptyFact(""),
    cageCode: cageCode
      ? makeFact(cageCode, "verified", "SAM.gov CAGE", "sam.gov", samEntity?.sourceUrl ?? null)
      : emptyFact(""),
    smallBusinessStatuses: sbFromSam.length
      ? makeFact(sbFromSam, "verified", "SAM.gov business types", "sam.gov", samEntity?.sourceUrl ?? null)
      : emptyFact([]),
    naics: naics.length
      ? makeFact(
          naics,
          samEntity?.naics.length ? "verified" : "high",
          samEntity?.naics.length ? "SAM.gov NAICS assertions" : "USASpending.gov awards",
          samEntity?.naics.length ? "sam.gov" : "usaspending.gov",
          samEntity?.sourceUrl ?? "https://www.usaspending.gov"
        )
      : emptyFact([]),
    agencies: agencies.length
      ? makeFact(agencies, "high", "USASpending.gov awarding agencies", "usaspending.gov", "https://www.usaspending.gov")
      : emptyFact([]),
    vehicles: vehicles.length
      ? makeFact(vehicles, "high", "USASpending.gov IDV / vehicle records", "usaspending.gov", "https://www.usaspending.gov")
      : emptyFact([]),
    contracts: contracts.length
      ? makeFact(contracts, "high", "USASpending.gov award records", "usaspending.gov", "https://www.usaspending.gov")
      : emptyFact([]),
    opportunities: opportunitiesVerified
      ? opportunities.length
        ? makeFact(opportunities, "high", "SAM.gov contract opportunities", "sam.gov", "https://sam.gov")
        : makeFact([], "not_found", "SAM.gov contract opportunities", "sam.gov", "https://sam.gov", "No current opportunities verified")
      : emptyFact([]),
    capabilityTags: capabilityTags.length
      ? makeFact(capabilityTags, "medium", "Company website / capability language", "company_website", website || null)
      : emptyFact([]),
    pastPerformanceTags: pastPerformanceTags.length
      ? makeFact(pastPerformanceTags, "medium", "Award descriptions / website", "usaspending.gov", "https://www.usaspending.gov")
      : emptyFact([]),
    technologyTags: technologyTags.length
      ? makeFact(technologyTags, "medium", "Named technologies in sources", "company_website", website || null)
      : emptyFact([]),
    marketAgency: agencies[0]
      ? makeFact(agencies[0].name, "high", "USASpending.gov top awarding agency", "usaspending.gov", "https://www.usaspending.gov")
      : emptyFact(""),
  };

  const snapshot: LeadResearchSnapshot = {
    mode,
    researchedAt: now,
    query: { companyName: queryName, website: websiteHint },
    companyName: legalName,
    legalCompanyName: samEntity?.legalName || usaSelected?.legalName || legalName,
    website,
    linkedinUrl,
    headquarters,
    companyDescription: description,
    marketAgency: agencies[0]?.name ?? "",
    smallBusinessStatuses: sbFromSam,
    uei,
    cageCode,
    naics,
    capabilityTags,
    agencies,
    vehicles,
    contracts,
    opportunities,
    opportunitiesVerified,
    pastPerformanceTags,
    technologyTags,
    suggestedRelationshipOwner: suggestedOwner,
    partnerFit,
    facts,
    checklist: buildChecklist({
      companyName: legalName,
      uei,
      cageCode,
      naics,
      agencies,
      vehicles,
      contracts,
      facts,
    }),
    summary: summarizeFacts(facts),
    sourcesUsed: [
      sam.configured
        ? { label: "SAM.gov", url: samEntity?.sourceUrl ?? "https://sam.gov", type: "sam.gov" as const }
        : null,
      { label: "USASpending.gov", url: "https://www.usaspending.gov", type: "usaspending.gov" as const },
      website ? { label: "Company website", url: website, type: "company_website" as const } : null,
      linkedinUrl ? { label: "LinkedIn", url: linkedinUrl, type: "linkedin" as const } : null,
    ].filter((s): s is NonNullable<typeof s> => s != null),
  };

  return { status: "complete", snapshot };
}
