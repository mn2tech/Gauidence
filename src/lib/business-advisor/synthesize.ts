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

function normalizeSynthesis(parsed: Record<string, unknown>): SynthesisResult {
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

export function parseSynthesis(raw: string): SynthesisResult {
  const jsonText = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!jsonText) {
    throw new Error("AI synthesis returned empty output.");
  }
  try {
    return normalizeSynthesis(JSON.parse(jsonText) as Record<string, unknown>);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Invalid JSON";
    throw new Error(`AI synthesis returned invalid JSON: ${detail}`);
  }
}

const FINDING_SOLUTION_MAP: Record<string, string> = {
  transport: "website_security_hardening",
  headers: "website_security_hardening",
  security: "website_security_hardening",
  seo: "seo_optimization",
  metadata: "seo_optimization",
  content: "seo_optimization",
  performance: "performance_optimization",
  trust: "client_portal",
  accessibility: "accessibility_compliance",
};

function severityToImpact(
  severity: AnalyzerFinding["severity"]
): "low" | "medium" | "high" {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function solutionKeyForFinding(finding: AnalyzerFinding): string | null {
  return (
    FINDING_SOLUTION_MAP[finding.category] ??
    FINDING_SOLUTION_MAP[finding.analyzer] ??
    null
  );
}

/** Rule-based synthesis when the LLM is unavailable or returns bad JSON. */
export function fallbackSynthesis(args: {
  companyName: string;
  websiteUrl: string;
  findings: AnalyzerFinding[];
  catalog: AdvisorServiceCatalogItem[];
}): SynthesisResult {
  const catalogKeys = new Set(args.catalog.map((c) => c.service_key));
  const playbook = INDUSTRY_PLAYBOOKS.general;

  const opportunities = args.findings.map((f, index) => ({
    title: f.business_impact,
    description: f.description,
    category: f.analyzer === "security" ? "security" : f.category || "operations",
    estimatedImpact: severityToImpact(f.severity),
    confidence: "high" as const,
    priority: Math.max(10, 100 - index * 8),
    potentialOutcome: f.business_impact,
    guardianSolutionKey: solutionKeyForFinding(f),
    findingTitle: f.title,
  }));

  const recommendedSolutionKeys = [
    ...new Set(
      [
        ...args.findings
          .map(solutionKeyForFinding)
          .filter((key): key is string => Boolean(key)),
        ...playbook.solutionKeys,
      ].filter((key) => catalogKeys.has(key))
    ),
  ].slice(0, 6);

  const outcomes = args.findings.slice(0, 5).map((f) => ({
    outcomeText: f.business_impact,
    measurableMetric: undefined,
  }));

  const findingSummary =
    args.findings.length === 0
      ? "No critical issues were detected in the automated scan."
      : `Our scan identified ${args.findings.length} area${
          args.findings.length === 1 ? "" : "s"
        } to strengthen security, trust, and discoverability.`;

  return {
    industry: "general",
    executiveSummary: `Guardian reviewed ${args.companyName}'s website (${args.websiteUrl}). ${findingSummary} The recommendations below translate technical findings into business outcomes and Guardian solutions you can price and deliver.`,
    opportunities,
    outcomes,
    recommendedSolutionKeys,
  };
}

/** Parse LLM JSON when possible; otherwise use deterministic fallback. */
export function resolveSynthesis(
  raw: string | null | undefined,
  fallbackArgs: {
    companyName: string;
    websiteUrl: string;
    findings: AnalyzerFinding[];
    catalog: AdvisorServiceCatalogItem[];
  }
): SynthesisResult {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return fallbackSynthesis(fallbackArgs);
  }
  try {
    return parseSynthesis(trimmed);
  } catch (err) {
    console.warn(
      "Business Advisor LLM synthesis parse failed; using fallback",
      err
    );
    return fallbackSynthesis(fallbackArgs);
  }
}
