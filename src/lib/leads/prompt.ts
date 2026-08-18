import type { BusinessLead } from "@/lib/leads/types";
import type { WebsiteDiscovery } from "@/lib/business-advisor/discovery";

export const LEAD_OPPORTUNITY_SYSTEM = `You are Gideon, Guardian's business assistant. Analyze a sales lead and identify a realistic NM2TECH / Guardian service opportunity.

Return strict JSON only (no markdown fences):
{
  "companySummary": string,
  "primaryNeed": string,
  "potentialNeeds": [
    {
      "label": string,
      "kind": "observed" | "inferred" | "unknown",
      "detail": string
    }
  ],
  "recommendedService": string,
  "reasoning": string,
  "conversationAngle": string,
  "suggestedOpening": string,
  "leadScore": number,
  "nextBestAction": string,
  "matchExplanation": string,
  "recommendedApproach": string
}

Scoring (leadScore 0–100 integer):
- For commercial: service fit, evidence of a real problem, contact quality, likelihood of an actionable sale
- For federal partners: NM2TECH teaming/subcontracting fit — AI/data/cloud/federal IT staffing overlap — without claiming unverified certifications or contracts

Evidence kinds:
- "observed" — directly supported by lead fields, notes, or website fetch data provided
- "inferred" — reasonable hypothesis; state uncertainty in detail
- "unknown" — cannot assess; frame as a question to explore

NM2TECH capabilities to consider (do not invent that the lead has these):
AI / Generative AI, Data Engineering, Data Architecture, SAS / SAS Viya, Cloud modernization, Azure, AWS, PostgreSQL, ETL / ELT, Machine Learning, AI agents, Knowledge management, Application development, Federal IT staffing, Data governance.

Rules:
- Never invent facts, certifications, UEI/CAGE, contract vehicles, or past performance.
- If no website data was provided, do not claim website issues as observed.
- recommendedService should align with the SERVICE CATALOG when possible.
- matchExplanation: 1–3 sentences on why this company may (or may not) be a fit. Label inference clearly.
- recommendedApproach: one concrete relationship move (e.g. "Request a 20-minute capability discussion as a data/AI subcontracting partner").
- suggestedOpening: under 60 words, personal, specific — no generic marketing language.
- nextBestAction: one concrete step.
- Max 5 items in potentialNeeds.`;

export function buildLeadOpportunityUserPrompt(args: {
  lead: BusinessLead;
  businessName: string;
  businessDescription?: string | null;
  businessIndustry?: string | null;
  discovery?: WebsiteDiscovery | null;
  discoveryError?: string | null;
  serviceCatalog: string;
  advisorCatalog: string;
  knowledgeContext?: string;
}): string {
  const lead = args.lead;
  const parts = [
    `BUSINESS WORKSPACE: ${args.businessName}`,
    args.businessDescription
      ? `Workspace description: ${args.businessDescription}`
      : null,
    args.businessIndustry ? `Industry: ${args.businessIndustry}` : null,
    "",
    "LEAD:",
    `Company: ${lead.company_name ?? "(unknown)"}`,
    `Contact: ${lead.contact_name ?? "(unknown)"}`,
    lead.job_title ? `Title: ${lead.job_title}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    `Type: ${lead.lead_type === "federal_partner" ? "Federal Partner" : "Commercial"}`,
    lead.market_agency ? `Market / agency: ${lead.market_agency}` : null,
    lead.small_business_status
      ? `Small business status: ${lead.small_business_status}`
      : null,
    lead.uei ? `UEI: ${lead.uei}` : null,
    lead.cage_code ? `CAGE: ${lead.cage_code}` : null,
    lead.naics_codes ? `NAICS: ${lead.naics_codes}` : null,
    lead.primary_capabilities
      ? `Stated capabilities: ${lead.primary_capabilities}`
      : null,
    lead.federal_agencies_served
      ? `Agencies served: ${lead.federal_agencies_served}`
      : null,
    lead.contract_vehicles
      ? `Contract vehicles (claimed): ${lead.contract_vehicles}`
      : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
    "",
    args.serviceCatalog ? `PROPOSAL SERVICE CATALOG:\n${args.serviceCatalog}` : null,
    args.advisorCatalog ? `ADVISOR SERVICE CATALOG:\n${args.advisorCatalog}` : null,
    args.knowledgeContext
      ? `GUARDIAN KNOWLEDGE:\n${args.knowledgeContext}`
      : null,
  ];

  if (args.discovery) {
    parts.push(
      "",
      "WEBSITE FETCH (observed):",
      `URL: ${args.discovery.finalUrl}`,
      `Status: ${args.discovery.statusCode}`,
      `HTTPS: ${args.discovery.isHttps}`,
      args.discovery.title ? `Title: ${args.discovery.title}` : null,
      args.discovery.metaDescription
        ? `Meta: ${args.discovery.metaDescription}`
        : null,
      args.discovery.h1 ? `H1: ${args.discovery.h1}` : null,
      `Text sample: ${args.discovery.textSample.slice(0, 2000)}`
    );
  } else if (lead.website) {
    parts.push(
      "",
      "WEBSITE FETCH: unavailable",
      args.discoveryError
        ? `Reason: ${args.discoveryError}`
        : "Could not fetch the website — treat website-specific claims as inferred or unknown."
    );
  } else {
    parts.push("", "WEBSITE: not provided on lead.");
  }

  parts.push(
    "",
    lead.lead_type === "federal_partner"
      ? "Evaluate this company as a potential federal teaming/subcontracting partner for NM2TECH. Distinguish verified facts from inference. Do not invent contracts or certifications."
      : "Identify the best commercial opportunity and what to do next."
  );
  return parts.filter(Boolean).join("\n");
}
