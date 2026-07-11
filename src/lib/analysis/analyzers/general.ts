import "server-only";

import type OpenAI from "openai";
import type { DocumentType, GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import { buildFileContent, modelForInputMode, runStructuredJson, type FilePayload } from "../openai";

/** Stub schemas for types that still route to the general analyzer. */
export const PASSPORT_FIELDS = [
  "document_number",
  "full_name",
  "nationality",
  "date_of_birth",
  "issue_date",
  "expiry_date",
] as const;

export const DRIVERS_LICENSE_FIELDS = [
  "license_number",
  "full_name",
  "address",
  "date_of_birth",
  "issue_date",
  "expiry_date",
  "class",
] as const;

export const WARRANTY_FIELDS = [
  "product_name",
  "manufacturer",
  "purchase_date",
  "warranty_end_date",
  "coverage_summary",
] as const;

export const TAX_DOCUMENT_FIELDS = [
  "form_type",
  "tax_year",
  "taxpayer_name",
  "issuer",
  "amounts",
] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["general"] },
    document_purpose: { type: "string" },
    likely_next_steps: { type: "array", items: { type: "string" } },
  },
  required: [...BASE_REQUIRED, "document_purpose", "likely_next_steps"],
} as const;

const SYSTEM = `You are Guardian's General Document Analyzer.
Use for unknown types, low-confidence classifications, and unsupported specialists
(passport, driver's license, warranty, tax documents until dedicated analyzers ship).
Rules:
- Extract title, purpose, summary, people, organizations, important dates, amounts, obligations, warnings, likely next steps.
- Do not force specialized invoice/insurance/contract fields.
- Be cautious: if a date's purpose is unclear, say so and mark needs_verification.
- Example cautious wording: "I found this date, but I could not confidently determine its purpose."
- Prefer omitting uncertain values over inventing them.`;

export async function analyzeGeneral(
  openai: OpenAI,
  file: FilePayload,
  classifiedAs?: DocumentType
): Promise<GuardianAnalysis> {
  const hint = classifiedAs
    ? `Classification hint (may be uncertain): ${classifiedAs}. Still use the general extractor; do not invent specialist fields.`
    : "No reliable specialist type. Extract only general fields.";

  const parsed = await runStructuredJson<Record<string, unknown>>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(file, `Analyze this document carefully.\n${hint}`),
    schemaName: "general_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
    model: modelForInputMode(file.inputMode),
  });

  const specialist = {
    document_purpose: parsed.document_purpose ?? "",
    likely_next_steps: parsed.likely_next_steps ?? [],
    classified_as: classifiedAs ?? "general",
  };

  const analysis = fromModelBase("general", parsed, specialist);
  const steps = Array.isArray(specialist.likely_next_steps)
    ? specialist.likely_next_steps.map(String)
    : [];
  analysis.suggested_actions = [
    ...new Set([...analysis.suggested_actions, ...steps]),
  ];
  return analysis;
}
