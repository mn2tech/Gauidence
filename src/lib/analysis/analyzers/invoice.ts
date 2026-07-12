import "server-only";

import type { ExtractedFact, GuardianAnalysis } from "../types";
import { BASE_ANALYSIS_PROPERTIES, BASE_REQUIRED } from "../schemas";
import { fromModelBase } from "../normalize";
import {
  buildFileContent,
  modelForInputMode,
  runStructuredJson,
  type FilePayload,
  type LlmClient,
  type UserContext,
} from "../llm";
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
You receive the invoice as visual page image(s) and/or document text. Prefer the visual layout for tables and amounts.

Critical rules:
1) Invoice number: ONLY values next to "Invoice #", "Invoice No.", "Invoice Number", or "Invoice ID".
   Preserve leading zeros and # (example shape: #0000016).
   NEVER use hours, dates, EIN, phone numbers, or amounts as the invoice number.
   If unreliable, return null.
2) Dates: Prefer explicitly labeled "Date" / "Invoice Date" and "Due" / "Due Date". ISO YYYY-MM-DD.
   Do NOT invent or recalculate a due date when an explicit due date exists.
   Do NOT derive due date from invoice date + payment terms when an explicit Due date is present.
3) Line items: Keep columns aligned — contractor | description | hours | rate | amount.
   Never shift values between columns. amount is the line total for that row.
   Extract EVERY visible line-item row. Do not omit contractors.
   Copy every digit exactly (16128 must not become 1628; 71628 must not become 712.62).
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

/**
 * Prefer deterministic labeled values from extracted/OCR text over AI guesses
 * when the text anchors are present. Does not hardcode fixture values.
 */
function reconcileWithAnchors(
  specialist: Record<string, unknown>,
  anchors: NonNullable<FilePayload["invoiceAnchors"]>
): { specialist: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const next = { ...specialist };

  if (anchors.invoice_number) {
    next.invoice_number = anchors.invoice_number;
    next.invoice_number_confidence = Math.max(
      Number(next.invoice_number_confidence) || 0,
      0.95
    );
    next.invoice_number_needs_verification = false;
  }

  // Explicit document dates always win — never keep a calculated substitute
  if (anchors.explicit_invoice_date && anchors.invoice_date) {
    if (next.invoice_date && next.invoice_date !== anchors.invoice_date) {
      warnings.push(
        `Invoice date from document text (${anchors.invoice_date}) preferred over model value.`
      );
    }
    next.invoice_date = anchors.invoice_date;
    next.dates_from_explicit_labels = true;
  }
  if (anchors.explicit_due_date && anchors.due_date) {
    if (next.due_date && next.due_date !== anchors.due_date) {
      warnings.push(
        `Due date from document text (${anchors.due_date}) preferred over calculated/model value.`
      );
    }
    next.due_date = anchors.due_date;
    next.dates_from_explicit_labels = true;
  }

  if (anchors.issuer) {
    next.issuer = anchors.issuer;
    next.issuer_confidence = Math.max(Number(next.issuer_confidence) || 0, 0.9);
  }
  if (anchors.billed_to) {
    next.billed_to = anchors.billed_to;
    next.billed_to_confidence = Math.max(Number(next.billed_to_confidence) || 0, 0.9);
  }

  if (anchors.subtotal != null) {
    next.subtotal = anchors.subtotal;
  }
  if (anchors.total_amount_due != null) {
    next.total_amount_due = anchors.total_amount_due;
    next.total_amount_due_confidence = Math.max(
      Number(next.total_amount_due_confidence) || 0,
      0.95
    );
  }

  if (anchors.line_items.length > 0) {
    const modelItems = Array.isArray(next.line_items)
      ? (next.line_items as Record<string, unknown>[])
      : [];
    // Prefer anchor rows when they look more complete
    if (anchors.line_items.length >= modelItems.length) {
      next.line_items = anchors.line_items.map((row) => ({
        contractor: row.contractor,
        description: row.description,
        hours: row.hours,
        rate: row.rate,
        amount: row.amount,
        quantity: row.hours,
        unit_rate: row.rate,
        line_total: row.amount,
        person_or_service: row.contractor,
        confidence: 0.95,
      }));
    }
  }

  return { specialist: next, warnings };
}

export async function analyzeInvoice(
  client: LlmClient,
  file: FilePayload,
  user: UserContext
): Promise<GuardianAnalysis> {
  const parsed = await runStructuredJson<Record<string, unknown>>(client, {
    system: SYSTEM,
    userContent: buildFileContent(
      file,
      "Analyze this invoice visually when page images are attached. Copy numbers exactly; do not drop digits. Include every line-item row."
    ),
    schemaName: "invoice_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
    model: modelForInputMode(file.inputMode),
  });

  let invoiceDate =
    typeof parsed.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date)
      ? parsed.invoice_date
      : null;
  let dueDate =
    typeof parsed.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
      ? parsed.due_date
      : null;

  let lineItems = normalizeLineItems(parsed.line_items);

  const inv = sanitizeInvoiceNumber(
    parsed.invoice_number,
    Number(parsed.invoice_number_confidence) || 0,
    invoiceDate
  );

  let issuer = String(parsed.issuer ?? "");
  let billedTo = String(parsed.billed_to ?? "");
  let issuerConf = Number(parsed.issuer_confidence) || 0.8;
  let billedConf = Number(parsed.billed_to_confidence) || 0.8;

  let specialist: Record<string, unknown> = {
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
    payment_status: parsed.payment_status ?? "unknown",
  };

  const anchorWarnings: string[] = [];
  if (file.invoiceAnchors && (file.extraction?.quality ?? 0) >= 0.45) {
    const reconciled = reconcileWithAnchors(specialist, file.invoiceAnchors);
    specialist = reconciled.specialist;
    anchorWarnings.push(...reconciled.warnings);
    invoiceDate = asDateString(specialist.invoice_date);
    dueDate = asDateString(specialist.due_date);
    issuer = String(specialist.issuer ?? "");
    billedTo = String(specialist.billed_to ?? "");
    issuerConf = Number(specialist.issuer_confidence) || issuerConf;
    billedConf = Number(specialist.billed_to_confidence) || billedConf;
    lineItems = normalizeLineItems(specialist.line_items);
    specialist.line_items = lineItems;
  }

  const direction = resolvePaymentDirection({
    issuer,
    billedTo,
    companyName: user.companyName ?? null,
    fullName: user.fullName ?? null,
  });
  specialist.payment_direction = direction;
  specialist.issuer = issuer;
  specialist.billed_to = billedTo;
  specialist.issuer_confidence = issuerConf;
  specialist.billed_to_confidence = billedConf;
  specialist.issuer_needs_verification = issuerConf < 0.75;
  specialist.billed_to_needs_verification = billedConf < 0.75;

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

  analysis.facts = buildInvoiceCanonicalFacts(specialist);
  analysis.suggested_actions = [suggestionForPaymentDirection(direction)];

  const warnings = [...analysis.warnings, ...anchorWarnings];
  if (inv.warning && !specialist.invoice_number) warnings.push(inv.warning);
  if (issuerConf < 0.75) {
    warnings.push("Issuer name needs verification.");
  }
  if (billedConf < 0.75) {
    warnings.push("Billed-to name needs verification.");
  }

  return { ...analysis, warnings };
}

function asDateString(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Exported for unit tests — pure line-item math helpers live in validate. */
export type { ExtractedFact };
