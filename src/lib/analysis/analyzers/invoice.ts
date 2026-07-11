import "server-only";

import type OpenAI from "openai";
import type { ExtractedFact, GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import {
  buildFileContent,
  runStructuredJson,
  type FilePayload,
  type UserContext,
} from "../openai";
import {
  resolvePaymentDirection,
  suggestionForPaymentDirection,
} from "../company";
import { sanitizeInvoiceNumber } from "../invoiceSanitize";
import { buildInvoiceCanonicalFacts } from "../invoiceDisplay";

export { sanitizeInvoiceNumber };

const LINE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractor: { type: "string" },
    description: { type: "string" },
    hours: { type: ["number", "null"] },
    rate: { type: ["number", "null"] },
    amount: { type: ["number", "null"] },
    confidence: { type: "number" },
  },
  required: ["contractor", "description", "hours", "rate", "amount", "confidence"],
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...BASE_ANALYSIS_PROPERTIES,
    document_type: { type: "string", enum: ["invoice"] },
    invoice_number: { type: ["string", "null"] },
    invoice_number_confidence: { type: "number" },
    invoice_number_source_excerpt: { type: "string" },
    issuer: { type: "string" },
    issuer_confidence: { type: "number" },
    billed_to: { type: "string" },
    billed_to_confidence: { type: "number" },
    invoice_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    dates_from_explicit_labels: { type: "boolean" },
    payment_terms: { type: "string" },
    purchase_order: { type: "string" },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    discount: { type: ["number", "null"] },
    total_amount_due: { type: ["number", "null"] },
    total_amount_due_confidence: { type: "number" },
    total_amount_due_label: { type: "string" },
    currency: { type: "string" },
    line_items: { type: "array", items: LINE_ITEM },
    payment_status: {
      type: "string",
      enum: ["unknown", "paid", "unpaid", "partially_paid"],
    },
  },
  required: [
    ...BASE_REQUIRED,
    "invoice_number",
    "invoice_number_confidence",
    "invoice_number_source_excerpt",
    "issuer",
    "issuer_confidence",
    "billed_to",
    "billed_to_confidence",
    "invoice_date",
    "due_date",
    "dates_from_explicit_labels",
    "payment_terms",
    "purchase_order",
    "subtotal",
    "tax",
    "discount",
    "total_amount_due",
    "total_amount_due_confidence",
    "total_amount_due_label",
    "currency",
    "line_items",
    "payment_status",
  ],
} as const;

const SYSTEM = `You are Guardian's Invoice Analyzer.
You receive NATIVE DOCUMENT TEXT when available. Trust that text's digits exactly — do not drop digits (e.g. 16128 must not become 1628).

Critical rules:
1) Invoice number: ONLY values next to "Invoice #", "Invoice No.", "Invoice Number", or "Invoice ID".
   Preserve leading zeros and # (example shape: #0000016).
   NEVER use hours, dates, EIN, phone numbers, or amounts as the invoice number.
   If unreliable, return null.
2) Dates: Prefer explicitly labeled "Date" / "Invoice Date" and "Due" / "Due Date". ISO YYYY-MM-DD.
   Do NOT invent or recalculate a due date when an explicit due date exists.
3) Line items: Keep columns aligned — contractor | description | hours | rate | amount.
   Never shift values between columns. amount is the line total for that row.
4) total_amount_due: ONLY from "Total Due", "Total Amount Due", "Amount Due", "Balance Due", "Grand Total", or final Total.
   NEVER use a single line amount or rate as the invoice total.
5) Leave facts/important_dates/amounts empty — specialist fields are authoritative.
6) payment_status stays "unknown" unless explicitly stated.
7) Do NOT invent payment_direction.`;

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeLineItems(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    // Support both new and legacy field names from the model
    const hours = asNumber(row.hours) ?? asNumber(row.quantity);
    const rate = asNumber(row.rate) ?? asNumber(row.unit_rate);
    const amount = asNumber(row.amount) ?? asNumber(row.line_total);
    const contractor =
      String(row.contractor ?? row.person_or_service ?? "").trim() ||
      String(row.description ?? "").trim();
    return {
      contractor,
      description: String(row.description ?? ""),
      hours,
      rate,
      amount,
      // legacy aliases kept for validation helpers
      quantity: hours,
      unit_rate: rate,
      line_total: amount,
      person_or_service: contractor,
      confidence: asNumber(row.confidence) ?? 0.5,
    };
  });
}

export async function analyzeInvoice(
  openai: OpenAI,
  file: FilePayload,
  user: UserContext
): Promise<GuardianAnalysis> {
  const parsed = await runStructuredJson<Record<string, unknown>>(openai, {
    system: SYSTEM,
    userContent: buildFileContent(
      file,
      "Analyze this invoice from the provided document text/tables. Copy numbers exactly; do not drop digits."
    ),
    schemaName: "invoice_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  const invoiceDate =
    typeof parsed.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date)
      ? parsed.invoice_date
      : null;
  const dueDate =
    typeof parsed.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
      ? parsed.due_date
      : null;

  const lineItems = normalizeLineItems(parsed.line_items);

  const inv = sanitizeInvoiceNumber(
    parsed.invoice_number,
    Number(parsed.invoice_number_confidence) || 0,
    invoiceDate
  );

  const issuer = String(parsed.issuer ?? "");
  const billedTo = String(parsed.billed_to ?? "");
  const issuerConf = Number(parsed.issuer_confidence) || 0.8;
  const billedConf = Number(parsed.billed_to_confidence) || 0.8;

  const direction = resolvePaymentDirection({
    issuer,
    billedTo,
    companyName: user.companyName ?? null,
    fullName: user.fullName ?? null,
  });

  const specialist: Record<string, unknown> = {
    __raw_model: parsed,
    invoice_number: inv.value,
    invoice_number_confidence: inv.confidence,
    invoice_number_needs_verification: inv.needsVerification,
    invoice_number_source_excerpt: parsed.invoice_number_source_excerpt ?? "",
    issuer,
    issuer_confidence: issuerConf,
    issuer_needs_verification: issuerConf < 0.75,
    billed_to: billedTo,
    billed_to_confidence: billedConf,
    billed_to_needs_verification: billedConf < 0.75,
    invoice_date: invoiceDate,
    due_date: dueDate,
    dates_from_explicit_labels: Boolean(parsed.dates_from_explicit_labels),
    payment_terms: parsed.payment_terms ?? "",
    purchase_order: parsed.purchase_order ?? "",
    subtotal: parsed.subtotal ?? null,
    tax: parsed.tax ?? null,
    discount: parsed.discount ?? null,
    total_amount_due: parsed.total_amount_due ?? null,
    total_amount_due_confidence: Number(parsed.total_amount_due_confidence) || 0.5,
    total_amount_due_label: parsed.total_amount_due_label ?? "",
    currency: parsed.currency ?? "USD",
    line_items: lineItems,
    payment_direction: direction,
    payment_status: parsed.payment_status ?? "unknown",
  };

  const analysis = fromModelBase(
    "invoice",
    {
      ...parsed,
      facts: [],
      important_dates: [],
      amounts: [],
      suggested_actions: [],
    },
    specialist
  );

  // Canonical facts rebuilt after validation (pipeline calls validate next, then
  // route rebuilds display facts). Seed here for completeness.
  analysis.facts = buildInvoiceCanonicalFacts(specialist);
  analysis.suggested_actions = [suggestionForPaymentDirection(direction)];

  const warnings = [...analysis.warnings];
  if (inv.warning) warnings.push(inv.warning);
  if (issuerConf < 0.75) {
    warnings.push("Issuer name needs verification.");
  }
  if (billedConf < 0.75) {
    warnings.push("Billed-to name needs verification.");
  }

  return { ...analysis, warnings };
}

/** Exported for unit tests — pure line-item math helpers live in validate. */
export type { ExtractedFact };
