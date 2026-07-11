import "server-only";

import type OpenAI from "openai";
import type { GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import {
  buildFileContent,
  runStructuredJson,
  type FilePayload,
  type UserContext,
} from "../openai";

const LINE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    person_or_service: { type: "string" },
    quantity: { type: ["number", "null"] },
    hours: { type: ["number", "null"] },
    unit_rate: { type: ["number", "null"] },
    line_total: { type: ["number", "null"] },
    confidence: { type: "number" },
  },
  required: [
    "description",
    "person_or_service",
    "quantity",
    "hours",
    "unit_rate",
    "line_total",
    "confidence",
  ],
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["invoice"] },
    invoice_number: { type: "string" },
    issuer: { type: "string" },
    billed_to: { type: "string" },
    invoice_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    payment_terms: { type: "string" },
    purchase_order: { type: "string" },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    discount: { type: ["number", "null"] },
    total_amount_due: { type: ["number", "null"] },
    currency: { type: "string" },
    line_items: { type: "array", items: LINE_ITEM },
    payment_direction: {
      type: "string",
      enum: ["receivable", "payable", "unknown"],
    },
    payment_status: {
      type: "string",
      enum: ["unknown", "paid", "unpaid", "partially_paid"],
    },
  },
  required: [
    ...BASE_REQUIRED,
    "invoice_number",
    "issuer",
    "billed_to",
    "invoice_date",
    "due_date",
    "payment_terms",
    "purchase_order",
    "subtotal",
    "tax",
    "discount",
    "total_amount_due",
    "currency",
    "line_items",
    "payment_direction",
    "payment_status",
  ],
} as const;

const SYSTEM = `You are Guardian's Invoice Analyzer.
Rules:
- Extract only values explicitly present. Prefer fields labeled Total, Amount Due, or Total Amount Due.
- Do not confuse invoice numbers with other numbers, rates with line totals, or line totals with subtotal.
- Never invent corrected amounts. Use null when unknown.
- payment_status must be "unknown" unless the document explicitly states paid/unpaid/partial.
- Never claim an invoice is unpaid without evidence.
- Dates ISO YYYY-MM-DD. Invoice date is a past event (is_past_event=true). Due date is a deadline (is_deadline=true).
- Facts use source_type=document for extracted values. Do not put suggestions in facts.
- suggested_actions are brief organizational guidance only.`;

export async function analyzeInvoice(
  openai: OpenAI,
  file: FilePayload,
  user: UserContext
): Promise<GuardianAnalysis> {
  const context = `User context for payment direction only (do not invent matches):
name=${user.fullName ?? "unknown"}; email=${user.email ?? "unknown"}.
If issuer matches the user, payment_direction=receivable. If billed_to matches, payable. Else unknown.`;

  const parsed = await runStructuredJson<Record<string, unknown>>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(
      file,
      `Analyze this invoice.\n${context}`
    ),
    schemaName: "invoice_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  const specialist = {
    invoice_number: parsed.invoice_number ?? "",
    issuer: parsed.issuer ?? "",
    billed_to: parsed.billed_to ?? "",
    invoice_date: parsed.invoice_date ?? null,
    due_date: parsed.due_date ?? null,
    payment_terms: parsed.payment_terms ?? "",
    purchase_order: parsed.purchase_order ?? "",
    subtotal: parsed.subtotal ?? null,
    tax: parsed.tax ?? null,
    discount: parsed.discount ?? null,
    total_amount_due: parsed.total_amount_due ?? null,
    currency: parsed.currency ?? "USD",
    line_items: parsed.line_items ?? [],
    payment_direction: parsed.payment_direction ?? "unknown",
    payment_status: parsed.payment_status ?? "unknown",
  };

  const analysis = fromModelBase("invoice", parsed, specialist);
  const direction = String(specialist.payment_direction);
  const actions = [...analysis.suggested_actions];

  if (direction === "receivable") {
    actions.push(
      "Monitor for payment. If payment has not been received by the due date, Guardian can help prepare a professional follow-up."
    );
  } else if (direction === "payable") {
    actions.push("Review the invoice details and prepare for payment by the due date.");
  } else {
    actions.push(
      "Confirm whether you are the payer or payment recipient before taking action."
    );
  }

  if (
    specialist.due_date &&
    typeof specialist.due_date === "string" &&
    specialist.payment_status === "unknown"
  ) {
    // Soft wording only — never claim unpaid
    const due = specialist.due_date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < new Date().toISOString().slice(0, 10)) {
      analysis.warnings.push(
        "Appears past its due date based on the invoice date and payment terms. Payment status is unknown."
      );
    }
  }

  return { ...analysis, suggested_actions: [...new Set(actions)] };
}
