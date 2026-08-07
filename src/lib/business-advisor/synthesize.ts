import type { AnalyzerFinding } from "./analyzers";
import type { AdvisorServiceCatalogItem } from "./types";
import { INDUSTRY_PLAYBOOKS } from "./catalog";

export const SYNTHESIS_SYSTEM = `You are Guardian Business Advisor — an executive consultant.
Return ONE compact JSON object only (no markdown, no prose). Keep every string short.

{
  "industry": "fire_department|healthcare|environmental|church|legal|professional_services|restaurant|general",
  "executiveSummary": "One paragraph, max 80 words.",
  "opportunities": [
    {
      "title": "outcome-focused title",
      "description": "max 20 words",
      "category": "security|seo|performance|trust|ai|operations",
      "estimatedImpact": "low|medium|high",
      "confidence": "low|medium|high",
      "priority": 1-100,
      "potentialOutcome": "measurable outcome",
      "guardianSolutionKey": "service_key or null",
      "findingTitle": "optional finding title"
    }
  ],
  "outcomes": [{ "outcomeText": "short outcome", "measurableMetric": "optional" }],
  "recommendedSolutionKeys": ["service_key"]
}

Rules:
- Max 4 opportunities, max 4 outcomes, max 5 recommendedSolutionKeys.
- Use only service_key values from the SERVICE CATALOG.
- Translate technical findings into business outcomes (never say "add testimonials").`;

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

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeSynthesis(parsed: Record<string, unknown>): SynthesisResult {
  return {
    industry: String(parsed.industry ?? "general"),
    executiveSummary: String(parsed.executiveSummary ?? ""),
    opportunities: Array.isArray(parsed.opportunities)
      ? (parsed.opportunities as SynthesisResult["opportunities"]).slice(0, 6)
      : [],
    outcomes: Array.isArray(parsed.outcomes)
      ? (parsed.outcomes as SynthesisResult["outcomes"]).slice(0, 6)
      : [],
    recommendedSolutionKeys: Array.isArray(parsed.recommendedSolutionKeys)
      ? (parsed.recommendedSolutionKeys as string[]).slice(0, 6)
      : [],
  };
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts = [
    trimmed,
    (() => {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
    })(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // try next salvage strategy
    }
  }

  return null;
}

/** Parse LLM JSON when valid; returns null instead of throwing. */
export function tryParseSynthesis(raw: string): SynthesisResult | null {
  const jsonText = stripJsonFences(raw);
  if (!jsonText) return null;
  const parsed = tryParseJsonObject(jsonText);
  if (!parsed) return null;
  return normalizeSynthesis(parsed);
}

export function parseSynthesis(raw: string): SynthesisResult {
  const result = tryParseSynthesis(raw);
  if (!result) {
    throw new Error("AI synthesis returned invalid or empty JSON.");
  }
  return result;
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
  const parsed = raw?.trim() ? tryParseSynthesis(raw) : null;
  if (parsed) return parsed;
  if (raw?.trim()) {
    console.warn(
      "Business Advisor LLM synthesis parse failed; using rule-based fallback"
    );
  }
  return fallbackSynthesis(fallbackArgs);
}
