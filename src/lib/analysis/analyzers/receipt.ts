import "server-only";

import type OpenAI from "openai";
import type { GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import { buildFileContent, runStructuredJson, type FilePayload } from "../openai";

const ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    quantity: { type: ["number", "null"] },
    unit_price: { type: ["number", "null"] },
    line_total: { type: ["number", "null"] },
    category: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "description",
    "quantity",
    "unit_price",
    "line_total",
    "category",
    "confidence",
  ],
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["receipt"] },
    merchant: { type: "string" },
    transaction_date: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    tip: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    currency: { type: "string" },
    payment_method_last4: { type: "string" },
    items: { type: "array", items: ITEM },
  },
  required: [
    ...BASE_REQUIRED,
    "merchant",
    "transaction_date",
    "subtotal",
    "tax",
    "tip",
    "total",
    "currency",
    "payment_method_last4",
    "items",
  ],
} as const;

const SYSTEM = `You are Guardian's Receipt Analyzer.
Rules:
- Distinguish subtotal, tax, tip, and total.
- Do not invent missing quantities.
- Flag unreadable line items with low confidence and needs_verification.
- Transaction date is a past event (is_past_event=true), not a deadline.`;

export async function analyzeReceipt(
  openai: OpenAI,
  file: FilePayload
): Promise<GuardianAnalysis> {
  const parsed = await runStructuredJson<Record<string, unknown>>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(file, "Analyze this receipt."),
    schemaName: "receipt_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  const specialist = {
    merchant: parsed.merchant ?? "",
    transaction_date: parsed.transaction_date ?? null,
    subtotal: parsed.subtotal ?? null,
    tax: parsed.tax ?? null,
    tip: parsed.tip ?? null,
    total: parsed.total ?? null,
    currency: parsed.currency ?? "USD",
    payment_method_last4: parsed.payment_method_last4 ?? "",
    items: parsed.items ?? [],
  };

  return fromModelBase("receipt", parsed, specialist);
}
