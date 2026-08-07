import type { AnalyzerFinding } from "./analyzers";
import type { AdvisorServiceCatalogItem } from "./types";
import { INDUSTRY_PLAYBOOKS } from "./catalog";

export const SYNTHESIS_SYSTEM = `You are Guardian Business Advisor — an executive consultant.
Given website/security findings and a service catalog, produce JSON only (no markdown fences):

{
  "industry": "fire_department|healthcare|environmental|church|legal|professional_services|restaurant|general",
  "executiveSummary": "2-3 paragraph executive summary for the business owner",
  "opportunities": [
    {
      "title": "business opportunity title (outcome language, not technical)",
      "description": "why this matters",
      "category": "security|seo|performance|trust|ai|operations",
      "estimatedImpact": "low|medium|high",
      "confidence": "low|medium|high",
      "priority": 1-100,
      "potentialOutcome": "measurable business outcome e.g. Increase buyer trust",
      "guardianSolutionKey": "service_key from catalog or null",
      "findingTitle": "optional matching finding title"
    }
  ],
  "outcomes": [
    { "outcomeText": "Increase customer trust", "measurableMetric": "optional %" }
  ],
  "recommendedSolutionKeys": ["service_key", ...]
}

Rules:
- Translate technical findings into business opportunities and executive outcomes.
- Never say "add testimonials" — say "Increase buyer trust".
- recommendedSolutionKeys must exist in the SERVICE CATALOG provided.
- Pick 3-6 solutions max, prioritized for the detected industry.`;

export function buildSynthesisPrompt(args: {
  companyName: string;
  websiteUrl: string;
  findings: AnalyzerFinding[];
  catalog: AdvisorServiceCatalogItem[];
  textSample: string;
}): string {
  const findingBlock = args.findings
    .map(
      (f) =>
        `- [${f.severity}] ${f.title}: ${f.description} | Impact: ${f.business_impact}`
    )
    .join("\n");
  const catalogBlock = args.catalog
    .map(
      (c) =>
        `- ${c.service_key}: ${c.name} (${c.category}) — ${c.description ?? ""}`
    )
    .join("\n");
  const playbooks = Object.entries(INDUSTRY_PLAYBOOKS)
    .map(([k, v]) => `${k}: ${v.label} → ${v.solutionKeys.join(", ")}`)
    .join("\n");

  return `COMPANY: ${args.companyName}
WEBSITE: ${args.websiteUrl}

FINDINGS:
${findingBlock || "(none)"}

HOMEPAGE TEXT SAMPLE:
${args.textSample.slice(0, 2000)}

SERVICE CATALOG:
${catalogBlock}

INDUSTRY PLAYBOOKS (hints):
${playbooks}`;
}

export type SynthesisResult = {
  industry: string;
  executiveSummary: string;
  opportunities: {
    title: string;
    description: string;
    category: string;
    estimatedImpact: "low" | "medium" | "high";
    confidence: "low" | "medium" | "high";
    priority: number;
    potentialOutcome: string;
    guardianSolutionKey: string | null;
    findingTitle?: string;
  }[];
  outcomes: { outcomeText: string; measurableMetric?: string }[];
  recommendedSolutionKeys: string[];
};

export function parseSynthesis(raw: string): SynthesisResult {
  const jsonText = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  return {
    industry: String(parsed.industry ?? "general"),
    executiveSummary: String(parsed.executiveSummary ?? ""),
    opportunities: Array.isArray(parsed.opportunities)
      ? (parsed.opportunities as SynthesisResult["opportunities"])
      : [],
    outcomes: Array.isArray(parsed.outcomes)
      ? (parsed.outcomes as SynthesisResult["outcomes"])
      : [],
    recommendedSolutionKeys: Array.isArray(parsed.recommendedSolutionKeys)
      ? (parsed.recommendedSolutionKeys as string[])
      : [],
  };
}
