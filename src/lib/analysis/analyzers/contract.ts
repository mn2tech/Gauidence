import "server-only";

import type { GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import {
  buildFileContent,
  modelForInputMode,
  runStructuredJson,
  type FilePayload,
  type LlmClient,
} from "../llm";
import { analysisDateRules } from "../dateResolve";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["contract"] },
    contract_title: { type: "string" },
    parties: { type: "array", items: { type: "string" } },
    effective_date: { type: ["string", "null"] },
    start_date: { type: ["string", "null"] },
    end_date: { type: ["string", "null"] },
    renewal_date: { type: ["string", "null"] },
    termination_date: { type: ["string", "null"] },
    notice_period_days: { type: ["number", "null"] },
    automatic_renewal: { type: ["boolean", "null"] },
    payment_terms: { type: "string" },
    contract_obligations: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    termination_terms: { type: "array", items: { type: "string" } },
    renewal_terms: { type: "array", items: { type: "string" } },
    governing_law: { type: "string" },
  },
  required: [
    ...BASE_REQUIRED,
    "contract_title",
    "parties",
    "effective_date",
    "start_date",
    "end_date",
    "renewal_date",
    "termination_date",
    "notice_period_days",
    "automatic_renewal",
    "payment_terms",
    "contract_obligations",
    "deliverables",
    "termination_terms",
    "renewal_terms",
    "governing_law",
  ],
} as const;

function buildSystem(): string {
  return `You are Guardian's Contract Analyzer.
Rules:
- Distinguish facts from legal interpretation. Extract deadlines and obligations as stated.
- Flag unclear or conflicting clauses in warnings.
- Recommendations are organizational guidance, not legal advice.
- Always include this suggested action when material rights are involved:
"Consider reviewing this clause with a qualified professional if it materially affects your rights or obligations."
- Mark end/renewal/termination dates as deadlines when they require action.
${analysisDateRules()}`;
}

export async function analyzeContract(
  client: LlmClient,
  file: FilePayload
): Promise<GuardianAnalysis> {
  const parsed = await runStructuredJson<Record<string, unknown>>(client, {
    system: buildSystem(),
    userContent: buildFileContent(file, "Analyze this contract."),
    schemaName: "contract_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
    model: modelForInputMode(file.inputMode),
  });

  const specialist = {
    contract_title: parsed.contract_title ?? "",
    parties: parsed.parties ?? [],
    effective_date: parsed.effective_date ?? null,
    start_date: parsed.start_date ?? null,
    end_date: parsed.end_date ?? null,
    renewal_date: parsed.renewal_date ?? null,
    termination_date: parsed.termination_date ?? null,
    notice_period_days: parsed.notice_period_days ?? null,
    automatic_renewal: parsed.automatic_renewal ?? null,
    payment_terms: parsed.payment_terms ?? "",
    obligations: parsed.contract_obligations ?? [],
    deliverables: parsed.deliverables ?? [],
    termination_terms: parsed.termination_terms ?? [],
    renewal_terms: parsed.renewal_terms ?? [],
    governing_law: parsed.governing_law ?? "",
  };

  const analysis = fromModelBase("contract", parsed, specialist);
  const obligations = Array.isArray(specialist.obligations)
    ? specialist.obligations.map(String)
    : [];
  analysis.obligations = [...new Set([...analysis.obligations, ...obligations])];
  analysis.people = [
    ...new Set([
      ...analysis.people,
      ...(Array.isArray(specialist.parties) ? specialist.parties.map(String) : []),
    ]),
  ];

  const legalNote =
    "Consider reviewing this clause with a qualified professional if it materially affects your rights or obligations.";
  if (!analysis.suggested_actions.includes(legalNote)) {
    analysis.suggested_actions.push(legalNote);
  }
  return analysis;
}
