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
  "nextBestAction": string
}

Scoring (leadScore 0–100 integer):
- Service fit to catalog
- Evidence of a real problem
- Contact data quality
- Business relevance
- Relationship / context from notes
- Likelihood of an actionable opportunity

Evidence kinds:
- "observed" — directly supported by lead fields, notes, or website fetch data provided
- "inferred" — reasonable hypothesis; state uncertainty in detail
- "unknown" — cannot assess; frame as a question to explore

Rules:
- Never invent facts. If no website data was provided, do not claim website issues as observed.
- recommendedService should align with the SERVICE CATALOG when possible.
- suggestedOpening: under 60 words, personal, specific — no generic marketing language.
- nextBestAction: one concrete step (e.g. "Send a personalized introduction email").
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
    lead.source_detail ? `Where we met: ${lead.source_detail}` : null,
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

  parts.push("", "Identify the best opportunity and what to do next.");
  return parts.filter(Boolean).join("\n");
}
