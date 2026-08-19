import {
  NM2TECH_CAPABILITIES,
  NM2TECH_NAICS,
  NM2TECH_TARGET_AGENCIES,
  NM2TECH_TECHNOLOGIES,
} from "@/lib/leads/research/catalogs";
import { companyNameSimilarity } from "@/lib/leads/research/normalize";
import type {
  AgencyEntry,
  KnownContractRecord,
  NaicsEntry,
  PartnerFitResult,
  ResearchOpportunityRecord,
  SuggestedOwner,
} from "@/lib/leads/research/types";

export type PartnerFitInput = {
  workspaceName: string;
  agencies: AgencyEntry[];
  capabilities: string[];
  technologies: string[];
  naics: NaicsEntry[];
  vehicles: Array<{ name: string }>;
  contracts: KnownContractRecord[];
  opportunities: ResearchOpportunityRecord[];
  smallBusinessStatuses: string[];
  headquarters: string;
  suggestedOwner: SuggestedOwner | null;
  companyName: string;
};

const DC_METRO = /\b(dc|d\.c\.|washington|maryland|md|virginia|va|arlington|alexandria|tysons|reston|mclean|bethesda|rockville|silver spring)\b/i;

function uniqueOverlap(left: string[], right: readonly string[]): string[] {
  const rightFold = right.map((v) => v.toLowerCase());
  return left.filter((v) =>
    rightFold.some((r) => r === v.toLowerCase() || r.includes(v.toLowerCase()) || v.toLowerCase().includes(r))
  );
}

export function complementaryNm2techCapabilities(companyCapabilities: string[]): string[] {
  const company = new Set(companyCapabilities.map((c) => c.toLowerCase()));
  return NM2TECH_CAPABILITIES.filter((cap) => {
    const key = cap.toLowerCase();
    if (key.includes("sas")) return !company.has("sas") && !company.has("sas / sas viya");
    if (key === "ai/ml") return !company.has("ai/ml") && !company.has("genai");
    if (key === "data engineering" || key === "data analytics" || key === "data governance") {
      return !company.has(key);
    }
    return ![...company].some((c) => key.includes(c) || c.includes(key));
  }).slice(0, 6);
}

function workspaceLabelFrom(name: string): string {
  return name.trim() || "NM2TECH";
}

export function computePartnerFit(input: PartnerFitInput): PartnerFitResult {
  const workspace = workspaceLabelFrom(input.workspaceName);
  const agencyNames = input.agencies.map((a) => a.name);
  const agencyOverlap = uniqueOverlap(agencyNames, NM2TECH_TARGET_AGENCIES);
  const capOverlap = uniqueOverlap(input.capabilities, [...NM2TECH_CAPABILITIES]);
  const techOverlap = uniqueOverlap(input.technologies, [...NM2TECH_TECHNOLOGIES]);
  const naicsOverlap = input.naics.filter((n) => NM2TECH_NAICS.includes(n.code));
  const hasVehicles = input.vehicles.length > 0;
  const activeContracts = input.contracts.filter((c) =>
    /active|current|open/i.test(c.status)
  );
  const hasContracts = input.contracts.length > 0;
  const hasOpps = input.opportunities.length > 0;
  const sb = input.smallBusinessStatuses.filter((s) => s && s !== "Unknown");
  const geo =
    DC_METRO.test(input.headquarters) ||
    /united states|usa|us\b/i.test(input.headquarters);
  const prior = Boolean(input.suggestedOwner);

  let score = 20;
  const signals: string[] = [];

  if (agencyOverlap.length > 0) {
    score += Math.min(18, agencyOverlap.length * 6);
    signals.push(`Overlapping agencies: ${agencyOverlap.join(", ")}`);
  }
  if (capOverlap.length > 0) {
    score += Math.min(12, capOverlap.length * 4);
    signals.push(`Shared capability language: ${capOverlap.join(", ")}`);
  }
  const complementary = complementaryNm2techCapabilities(input.capabilities);
  if (complementary.length > 0) {
    score += Math.min(10, complementary.length * 2);
    signals.push(`${workspace} can complement: ${complementary.join(", ")}`);
  }
  if (naicsOverlap.length > 0) {
    score += 8;
    signals.push(`Aligned NAICS: ${naicsOverlap.map((n) => n.code).join(", ")}`);
  }
  if (hasVehicles) {
    score += 8;
    signals.push(`${input.vehicles.length} contract vehicle(s) identified`);
  }
  if (hasContracts) {
    score += activeContracts.length > 0 ? 10 : 6;
    signals.push(
      activeContracts.length > 0
        ? "Active federal contracts found"
        : "Federal award history found"
    );
  }
  if (hasOpps) {
    score += 8;
    signals.push(`${input.opportunities.length} verified current opportunity(ies)`);
  }
  if (techOverlap.length > 0) {
    score += Math.min(8, techOverlap.length * 3);
    signals.push(`Technology overlap: ${techOverlap.join(", ")}`);
  }
  if (sb.length > 0 && !sb.includes("Unknown")) {
    score += 4;
    signals.push(`Small-business profile: ${sb.join(", ")}`);
  }
  if (geo) {
    score += 4;
    signals.push("National Capital Region / U.S. presence");
  }
  if (prior) {
    score += 10;
    signals.push(`Existing ${workspace} relationship evidence`);
  }

  score = Math.max(0, Math.min(99, Math.round(score)));
  const priority: PartnerFitResult["priority"] =
    score >= 70 ? "High" : score >= 45 ? "Medium" : "Low";

  let relationshipType = "Watch List";
  if (hasVehicles && (hasContracts || agencyOverlap.length > 0)) {
    relationshipType = "Target Prime / Teaming Partner";
  } else if (sb.includes("8(a)") || sb.includes("SDVOSB") || sb.includes("HUBZone")) {
    relationshipType = "Set-aside Teaming Partner";
  } else if (hasContracts) {
    relationshipType = "Subcontracting Partner";
  } else if (priority === "High") {
    relationshipType = "Target Prime / Teaming Partner";
  }

  const nm2techCanBring = complementary.length > 0 ? complementary : [...NM2TECH_CAPABILITIES].slice(0, 4);

  const agencyBit =
    agencyOverlap.length > 0
      ? `${input.companyName} already serves ${agencyOverlap.slice(0, 3).join(", ")}, which aligns with ${workspace} federal capture.`
      : `${input.companyName} is a federal IT provider; agency overlap is still being confirmed.`;
  const capBit =
    input.capabilities.length > 0
      ? `Their strongest evidenced capabilities include ${input.capabilities.slice(0, 4).join(", ")}.`
      : `Capability coverage is incomplete pending source review.`;
  const bringBit = `${workspace} can bring ${nm2techCanBring.slice(0, 4).join(", ")} where those are complementary rather than duplicative.`;
  const whyCompanyMatters = [agencyBit, capBit, bringBit]
    .join(" ")
    .slice(0, 700);

  const companyCaps = input.capabilities.slice(0, 3).join("/");
  const offer = nm2techCanBring.slice(0, 5).join(", ");
  const outreachAngle = `Explore subcontracting and teaming opportunities where ${workspace} can augment ${input.companyName}'s ${companyCaps || "federal programs"} with ${offer || "federal data engineering, AI/ML, Azure, SAS, analytics and application-development resources"}.`;

  return {
    score,
    priority,
    relationshipType,
    whyCompanyMatters,
    nm2techCanBring,
    outreachAngle,
    signals,
  };
}

export function pickSuggestedOwner(
  existing: Array<{ companyName: string | null; website: string | null; owner: string | null }>,
  query: { companyName: string; website: string }
): SuggestedOwner | null {
  let best: { owner: string; score: number; evidence: string } | null = null;
  for (const row of existing) {
    const owner = row.owner?.trim();
    if (!owner) continue;
    const nameScore = companyNameSimilarity(query.companyName, row.companyName ?? "");
    const siteScore =
      query.website && row.website
        ? companyNameSimilarity(query.website, row.website)
        : 0;
    const score = Math.max(nameScore, siteScore);
    if (score >= 0.8 && (!best || score > best.score)) {
      best = {
        owner,
        score,
        evidence: `Existing NM2TECH lead record for ${row.companyName ?? "this company"}`,
      };
    }
  }
  return best ? { name: best.owner, evidence: best.evidence } : null;
}
