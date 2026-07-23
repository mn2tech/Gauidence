import type { Classification, GuardianAnalysis } from "@/lib/analysis/types";
import type { OrganizationAiOutput } from "./types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function inferVaultName(
  analysis: GuardianAnalysis,
  classification: Classification,
  currentProfileName: string | null
): string {
  const type = analysis.document_type;
  if (type === "passport" || type === "drivers_license") return "Identity";
  if (type === "invoice" || type === "receipt") return "Finance";
  if (type === "insurance") return "Insurance";
  if (type === "tax_document") return "Tax";
  if (type === "contract") return "Contracts";
  const subtype = classification.document_subtype?.toLowerCase() ?? "";
  if (subtype.includes("reading") || subtype.includes("book")) return "Reading";
  if (currentProfileName) return currentProfileName;
  return "Personal";
}

function inferProfileName(
  analysis: GuardianAnalysis,
  currentProfileName: string | null
): string {
  if (analysis.people.length > 0) return analysis.people[0];
  return currentProfileName?.trim() || "Personal";
}

function inferTopics(analysis: GuardianAnalysis): string[] {
  const topics = new Set<string>();
  for (const p of analysis.people) topics.add(p.toLowerCase());
  for (const o of analysis.organizations) topics.add(o.toLowerCase());
  topics.add(analysis.document_type.replace(/_/g, " "));
  return [...topics].filter(Boolean);
}

function inferTags(analysis: GuardianAnalysis): string[] {
  const tags = new Set<string>();
  const typeLabel = analysis.document_type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  tags.add(typeLabel);
  for (const p of analysis.people.slice(0, 3)) {
    tags.add(p);
  }
  if (analysis.document_type.includes("reading") || analysis.title.toLowerCase().includes("book")) {
    tags.add("Books");
    tags.add("Reading");
  }
  return [...tags];
}

function inferQuestions(analysis: GuardianAnalysis): string[] {
  const qs: string[] = [];
  if (analysis.title) {
    qs.push(`What is this document about (${analysis.title})?`);
  }
  if (analysis.people.length > 0) {
    qs.push(`Who is mentioned in this document?`);
  }
  if (analysis.important_dates.length > 0) {
    qs.push(`What are the important dates?`);
  }
  if (analysis.facts.length > 0) {
    qs.push(`Summarize the key details.`);
  }
  return qs.slice(0, 5);
}

/** Build and validate organization AI output from pipeline analysis. */
export function buildOrganizationAiOutput(
  analysis: GuardianAnalysis,
  classification: Classification,
  currentProfileName: string | null
): OrganizationAiOutput {
  const profileName = inferProfileName(analysis, currentProfileName);
  const vaultName = inferVaultName(analysis, classification, currentProfileName);
  const confidence = clampConfidence(
    analysis.overall_confidence ?? classification.classification_confidence
  );

  const raw: OrganizationAiOutput = {
    title: analysis.title?.trim() || "Untitled document",
    document_type: analysis.document_type,
    summary: analysis.summary?.trim() || "",
    people: asStringArray(analysis.people),
    organizations: asStringArray(analysis.organizations),
    topics: inferTopics(analysis),
    dates: analysis.important_dates
      .map((d) => d.date ?? d.value)
      .filter((d): d is string => typeof d === "string" && Boolean(d)),
    tags: inferTags(analysis),
    suggested_profile_name: profileName,
    suggested_vault_name: vaultName,
    confidence,
    reason:
      classification.classification_reason?.trim() ||
      analysis.summary?.trim() ||
      "Guardian analyzed this document and inferred where it belongs.",
    suggested_questions: inferQuestions(analysis),
  };

  return validateOrganizationAiOutput(raw);
}

export function validateOrganizationAiOutput(
  value: unknown
): OrganizationAiOutput {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;

  const title =
    typeof v.title === "string" && v.title.trim()
      ? v.title.trim()
      : "Untitled document";
  const document_type =
    typeof v.document_type === "string" && v.document_type.trim()
      ? v.document_type.trim()
      : "general";
  const summary = typeof v.summary === "string" ? v.summary.trim() : "";
  const suggested_profile_name =
    typeof v.suggested_profile_name === "string"
      ? v.suggested_profile_name.trim()
      : "";
  const suggested_vault_name =
    typeof v.suggested_vault_name === "string"
      ? v.suggested_vault_name.trim()
      : suggested_profile_name;
  const reason =
    typeof v.reason === "string" && v.reason.trim()
      ? v.reason.trim()
      : "Guardian analyzed this document.";

  return {
    title,
    document_type,
    summary,
    people: asStringArray(v.people),
    organizations: asStringArray(v.organizations),
    topics: asStringArray(v.topics),
    dates: asStringArray(v.dates),
    tags: asStringArray(v.tags),
    suggested_profile_name,
    suggested_vault_name,
    confidence: clampConfidence(v.confidence),
    reason,
    suggested_questions: asStringArray(v.suggested_questions).slice(0, 8),
  };
}
