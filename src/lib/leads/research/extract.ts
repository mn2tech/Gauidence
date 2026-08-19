import "server-only";

import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { isAnthropicConfigured, isChatLlmConfigured } from "@/lib/analysis/chatProvider";
import { CAPABILITY_CATALOG, TECHNOLOGY_CATALOG } from "@/lib/leads/research/catalogs";
import {
  extractCapabilityTags,
  extractPastPerformanceTags,
  extractTechnologyTags,
} from "@/lib/leads/research/normalize";
import { withLlmUsage } from "@/lib/usage/record";
import type { WebsiteDiscovery } from "@/lib/business-advisor/discovery";

export type LlmResearchExtract = {
  legalName: string;
  description: string;
  headquarters: string;
  website: string;
  linkedinUrl: string;
  capabilityTags: string[];
  pastPerformanceTags: string[];
  technologyTags: string[];
  whyCompanyMatters: string;
  nm2techCanBring: string[];
  outreachAngle: string;
};

const EXTRACT_SYSTEM = `You extract federal contractor intelligence for Guardian Leads.
You may ONLY use facts present in the SOURCE PACKET. Never invent UEI, CAGE, NAICS, certifications, contract vehicles, award numbers, or opportunities.
If a fact is missing, return an empty string or empty array.
Do not treat marketing language as verified certifications.
Primary capabilities must be short searchable tags (2-4 words), never paragraphs.
Technology tags only if the source explicitly names the product/platform.
Respond with a single JSON object:
{
  "legalName": string,
  "description": string,
  "headquarters": string,
  "website": string,
  "linkedinUrl": string,
  "capabilityTags": string[],
  "pastPerformanceTags": string[],
  "technologyTags": string[],
  "whyCompanyMatters": string,
  "nm2techCanBring": string[],
  "outreachAngle": string
}
whyCompanyMatters: 2-4 sentences, evidence-based, no hype.
nm2techCanBring: subset of [AI/ML, Data Engineering, Data Analytics, SAS / SAS Viya, Azure, Cloud Engineering, Application Development, Data Governance, Federal technical staffing] that would complement THIS company. Do not list all of them by default.
outreachAngle: one internal sentence for NM2TECH capture, not a customer email.`;

function parseExtract(raw: string): LlmResearchExtract | null {
  const trimmed = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const str = (key: string) =>
      typeof parsed[key] === "string" ? String(parsed[key]).trim() : "";
    const arr = (key: string) =>
      Array.isArray(parsed[key])
        ? parsed[key].map((v) => String(v).trim()).filter(Boolean)
        : [];
    return {
      legalName: str("legalName") || str("legal_name"),
      description: str("description") || str("companyDescription"),
      headquarters: str("headquarters"),
      website: str("website"),
      linkedinUrl: str("linkedinUrl") || str("linkedin"),
      capabilityTags: extractCapabilityTags(arr("capabilityTags")),
      pastPerformanceTags: extractPastPerformanceTags(arr("pastPerformanceTags")),
      technologyTags: extractTechnologyTags(arr("technologyTags")),
      whyCompanyMatters: str("whyCompanyMatters"),
      nm2techCanBring: arr("nm2techCanBring").slice(0, 8),
      outreachAngle: str("outreachAngle"),
    };
  } catch {
    return null;
  }
}

export async function extractResearchNarrative(args: {
  userId: string;
  companyName: string;
  workspaceName: string;
  samJson: string;
  usaJson: string;
  webBlock: string;
  discovery: WebsiteDiscovery | null;
  discoveryError: string | null;
}): Promise<LlmResearchExtract | null> {
  if (!isChatLlmConfigured()) return null;

  const capabilityHint = CAPABILITY_CATALOG.map((c) => c.canonical).join(", ");
  const techHint = TECHNOLOGY_CATALOG.map((c) => c.canonical).join(", ");
  const site = args.discovery
    ? `Title: ${args.discovery.title ?? ""}\nDescription: ${args.discovery.metaDescription ?? ""}\nURL: ${args.discovery.finalUrl}\nText: ${args.discovery.textSample.slice(0, 2500)}`
    : args.discoveryError
      ? `Website fetch error: ${args.discoveryError}`
      : "(no website fetch)";

  const userPrompt = `Workspace: ${args.workspaceName}
Query company: ${args.companyName}

Allowed capability tags: ${capabilityHint}
Allowed technology tags (only if explicitly evidenced): ${techHint}

--- SAM.GOV / FEDERAL REGISTRATION ---
${args.samJson.slice(0, 6000)}

--- USASPENDING.GOV ---
${args.usaJson.slice(0, 7000)}

--- COMPANY WEBSITE ---
${site}

--- WEB SEARCH (secondary only) ---
${args.webBlock.slice(0, 5000)}
`;

  try {
    const client = isAnthropicConfigured() ? createLlmClient() : null;
    const raw = await withLlmUsage({ userId: args.userId, feature: "research" }, () =>
      runChatCompletion(client, {
        system: EXTRACT_SYSTEM,
        model: CHAT_MODEL,
        maxTokens: 1800,
        messages: [{ role: "user", content: userPrompt }],
      })
    );
    return parseExtract(raw);
  } catch (err) {
    console.warn("Lead research narrative extract failed", {
      message: err instanceof Error ? err.message.slice(0, 180) : "unknown",
    });
    return null;
  }
}
