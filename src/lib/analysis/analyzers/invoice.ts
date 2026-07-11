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
import {
  looksLikeDateString,
  resolvePaymentDirection,
  suggestionForPaymentDirection,
} from "../company";
import { buildInvoiceCanonicalFacts } from "../invoiceDisplay";

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
    invoice_number: { type: ["string", "null"] },
    invoice_number_confidence: { type: "number" },
    invoice_number_source_excerpt: { type: "string" },
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
    "billed_to",
    "invoice_date",
    "due_date",
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
Critical extraction rules:
1) Invoice number: ONLY take a value next to labels like "Invoice #", "Invoice No.", "Invoice Number", or "Invoice ID".
   NEVER use a date (including ISO dates like 2026-07-01) as the invoice number unless that exact date-like string is explicitly labeled as the invoice number.
   If no reliable invoice number is found, return null for invoice_number and set invoice_number_confidence below 0.5.
2) total_amount_due: ONLY take values labeled "Total Amount Due", "Amount Due", "Balance Due", "Invoice Total", "Grand Total", or a clearly final "Total".
   NEVER use a line-item total, hourly rate, quantity, or individual service amount as total_amount_due.
   Prefer the bottom/final total. If multiple candidates conflict, set total_amount_due to null and lower total_amount_due_confidence.
3) Do not put the same canonical fields into facts/important_dates/amounts — leave those arrays mostly empty for invoices; specialist fields are authoritative.
4) Dates ISO YYYY-MM-DD. Invoice date is a past event. Due date is a deadline.
5) payment_status must be "unknown" unless the document explicitly states paid/unpaid/partial.
6) Never invent corrected amounts. Never claim unpaid without evidence.
7) Do NOT set payment_direction — the application computes that from the user's saved company profile.`;

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeInvoiceNumber(
  raw: unknown,
  confidence: number,
  invoiceDate: string | null
): { value: string | null; confidence: number; needsVerification: boolean; warning?: string } {
  if (raw == null || raw === "") {
    return {
      value: null,
      confidence: 0,
      needsVerification: true,
      warning: "Invoice number needs verification.",
    };
  }
  const value = String(raw).trim();
  if (!value) {
    return {
      value: null,
      confidence: 0,
      needsVerification: true,
      warning: "Invoice number needs verification.",
    };
  }
  // Reject dates mistaken for invoice numbers.
  if (looksLikeDateString(value) || (invoiceDate && value === invoiceDate)) {
    return {
      value: null,
      confidence: 0,
      needsVerification: true,
      warning: "Invoice number needs verification.",
    };
  }
  if (confidence < 0.75) {
    return { value, confidence, needsVerification: true };
  }
  return { value, confidence, needsVerification: false };
}

function sanitizeTotal(
  raw: unknown,
  confidence: number,
  label: string,
  lineItems: Record<string, unknown>[]
): { value: number | null; confidence: number; needsVerification: boolean; warning?: string } {
  const total = asNumber(raw);
  if (total == null) {
    return {
      value: null,
      confidence: Math.min(confidence, 0.4),
      needsVerification: true,
      warning: "Total amount due needs verification.",
    };
  }

  const lineTotals = lineItems
    .map((i) => asNumber(i.line_total))
    .filter((n): n is number => n != null);
  const rates = lineItems
    .map((i) => asNumber(i.unit_rate))
    .filter((n): n is number => n != null);

  // If the "total" equals exactly one line total or a rate and the label is weak, reject.
  const labelOk = /total amount due|amount due|balance due|invoice total|grand total|^total$/i.test(
    label.trim() || "total"
  );
  const matchesSingleLine =
    lineTotals.length > 0 && lineTotals.some((lt) => Math.abs(lt - total) < 0.01);
  const matchesRate = rates.some((r) => Math.abs(r - total) < 0.01);

  if (!labelOk && (matchesSingleLine || matchesRate)) {
    return {
      value: null,
      confidence: 0.3,
      needsVerification: true,
      warning: "Total amount due needs verification.",
    };
  }

  if (confidence < 0.75 || !labelOk) {
    return {
      value: total,
      confidence: Math.min(confidence, 0.7),
      needsVerification: true,
    };
  }

  return { value: total, confidence, needsVerification: false };
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
      "Analyze this invoice. Extract specialist fields carefully. Leave facts/important_dates/amounts empty when specialist fields cover them."
    ),
    schemaName: "invoice_analysis",
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  const invoiceDate =
    typeof parsed.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date)
      ? parsed.invoice_date
      : null;
  const lineItems = Array.isArray(parsed.line_items)
    ? (parsed.line_items as Record<string, unknown>[])
    : [];

  const inv = sanitizeInvoiceNumber(
    parsed.invoice_number,
    Number(parsed.invoice_number_confidence) || 0,
    invoiceDate
  );
  const tot = sanitizeTotal(
    parsed.total_amount_due,
    Number(parsed.total_amount_due_confidence) || 0,
    String(parsed.total_amount_due_label ?? ""),
    lineItems
  );

  const issuer = String(parsed.issuer ?? "");
  const billedTo = String(parsed.billed_to ?? "");
  const direction = resolvePaymentDirection({
    issuer,
    billedTo,
    companyName: user.companyName ?? null,
    fullName: user.fullName ?? null,
  });

  const specialist: Record<string, unknown> = {
    invoice_number: inv.value,
    invoice_number_confidence: inv.confidence,
    invoice_number_needs_verification: inv.needsVerification,
    invoice_number_source_excerpt: parsed.invoice_number_source_excerpt ?? "",
    issuer,
    billed_to: billedTo,
    invoice_date: invoiceDate,
    due_date: parsed.due_date ?? null,
    payment_terms: parsed.payment_terms ?? "",
    purchase_order: parsed.purchase_order ?? "",
    subtotal: parsed.subtotal ?? null,
    tax: parsed.tax ?? null,
    discount: parsed.discount ?? null,
    total_amount_due: tot.value,
    total_amount_due_confidence: tot.confidence,
    total_amount_due_needs_verification: tot.needsVerification,
    total_amount_due_label: parsed.total_amount_due_label ?? "",
    currency: parsed.currency ?? "USD",
    line_items: lineItems,
    payment_direction: direction,
    payment_status: parsed.payment_status ?? "unknown",
  };

  // Strip AI-emitted duplicate facts; rebuild from specialist only.
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

  const warnings = [...analysis.warnings];
  if (inv.warning) warnings.push(inv.warning);
  if (tot.warning) warnings.push(tot.warning);

  if (
    specialist.due_date &&
    typeof specialist.due_date === "string" &&
    specialist.payment_status === "unknown"
  ) {
    const due = specialist.due_date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < new Date().toISOString().slice(0, 10)) {
      warnings.push(
        "Appears past its due date based on the invoice date and payment terms. Payment status is unknown."
      );
    }
  }

  if (inv.needsVerification || tot.needsVerification) {
    analysis.overall_confidence = Math.min(analysis.overall_confidence, 0.7);
  }

  return { ...analysis, warnings };
}
