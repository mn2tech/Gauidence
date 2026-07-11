import "server-only";

import type OpenAI from "openai";
import type { GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import { buildFileContent, modelForInputMode, runStructuredJson, type FilePayload } from "../openai";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["insurance"] },
    policy_type: { type: "string" },
    insurer: { type: "string" },
    policy_holder: { type: "string" },
    policy_number: { type: "string" },
    effective_date: { type: ["string", "null"] },
    expiration_date: { type: ["string", "null"] },
    renewal_date: { type: ["string", "null"] },
    premium: { type: ["number", "null"] },
    deductible: { type: ["number", "null"] },
    coverage_limits: { type: "array", items: { type: "string" } },
    covered_assets_or_people: { type: "array", items: { type: "string" } },
    exclusions: { type: "array", items: { type: "string" } },
    automatic_renewal: { type: ["boolean", "null"] },
  },
  required: [
    ...BASE_REQUIRED,
    "policy_type",
    "insurer",
    "policy_holder",
    "policy_number",
    "effective_date",
    "expiration_date",
    "renewal_date",
    "premium",
    "deductible",
    "coverage_limits",
    "covered_assets_or_people",
    "exclusions",
    "automatic_renewal",
  ],
} as const;

const SYSTEM = `You are Guardian's Insurance Analyzer.
Rules:
- Distinguish effective, expiration, and renewal dates. Do not treat every date as expiration.
- Mark effective_date as is_past_event when it is a start date; expiration/renewal as is_deadline.
- Flag exclusions or ambiguous coverage with needs_verification.
- Do not provide legal or insurance guarantees.
- Extract only what is stated.`;

export async function analyzeInsurance(
  openai: OpenAI,
  file: FilePayload
): Promise<GuardianAnalysis> {
  const parsed = await runStructuredJson<Record<string, unknown>>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(file, "Analyze this insurance document."),
    schemaName: "insurance_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
    model: modelForInputMode(file.inputMode),
  });

  const specialist = {
    policy_type: parsed.policy_type ?? "",
    insurer: parsed.insurer ?? "",
    policy_holder: parsed.policy_holder ?? "",
    policy_number: parsed.policy_number ?? "",
    effective_date: parsed.effective_date ?? null,
    expiration_date: parsed.expiration_date ?? null,
    renewal_date: parsed.renewal_date ?? null,
    premium: parsed.premium ?? null,
    deductible: parsed.deductible ?? null,
    coverage_limits: parsed.coverage_limits ?? [],
    covered_assets_or_people: parsed.covered_assets_or_people ?? [],
    exclusions: parsed.exclusions ?? [],
    automatic_renewal: parsed.automatic_renewal ?? null,
  };

  const analysis = fromModelBase("insurance", parsed, specialist);
  if (Array.isArray(specialist.exclusions) && specialist.exclusions.length > 0) {
    analysis.warnings.push(
      "This policy lists exclusions or limits that may need verification against your situation."
    );
  }
  return analysis;
}
