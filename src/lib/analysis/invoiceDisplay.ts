import type { ExtractedFact } from "./types";
import { normalizeFact } from "./normalize";
import type { InvoiceRateSource } from "./invoiceLineRates";
import { isPlausibleHourlyRate } from "./invoiceLineRates";

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.02;
}

/** Build a single canonical fact list for invoices (no duplicates). Safe for client. */
export function buildInvoiceCanonicalFacts(
  specialist: Record<string, unknown>
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const push = (partial: Partial<ExtractedFact> & { label: string; value: string }) => {
    const f = normalizeFact({
      source_type: "document",
      confidence: 0.9,
      source_excerpt: "",
      page_number: null,
      needs_verification: false,
      date: null,
      is_deadline: false,
      is_past_event: false,
      ...partial,
    });
    if (f) facts.push(f);
  };

  const invNo = specialist.invoice_number;
  if (invNo != null && String(invNo).trim()) {
    push({
      label: "Invoice number",
      value: String(invNo),
      confidence: Number(specialist.invoice_number_confidence) || 0.9,
      needs_verification: Boolean(specialist.invoice_number_needs_verification),
      source_excerpt: String(specialist.invoice_number_source_excerpt ?? ""),
    });
  } else {
    push({
      label: "Invoice number",
      value: "Needs verification",
      confidence: 0.2,
      needs_verification: true,
      source_type: "ai_suggestion",
    });
  }

  if (specialist.issuer) {
    push({
      label: "Issuer",
      value: String(specialist.issuer),
      confidence: Number(specialist.issuer_confidence) || 0.9,
      needs_verification: Boolean(specialist.issuer_needs_verification),
    });
  }
  if (specialist.billed_to) {
    push({
      label: "Billed to",
      value: String(specialist.billed_to),
      confidence: Number(specialist.billed_to_confidence) || 0.9,
      needs_verification: Boolean(specialist.billed_to_needs_verification),
    });
  }

  const invoiceDate =
    typeof specialist.invoice_date === "string" ? specialist.invoice_date : null;
  if (invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    push({
      label: "Invoice date",
      value: invoiceDate,
      date: invoiceDate,
      is_past_event: true,
      is_deadline: false,
    });
  }

  const dueDate = typeof specialist.due_date === "string" ? specialist.due_date : null;
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    push({
      label: "Due date",
      value: dueDate,
      date: dueDate,
      is_deadline: true,
      is_past_event: false,
    });
  }

  if (specialist.payment_terms)
    push({ label: "Payment terms", value: String(specialist.payment_terms) });

  const currency = String(specialist.currency ?? "USD");
  const money = (n: number) =>
    `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const subtotal = asNumber(specialist.subtotal);
  const hideSubtotal = Boolean(specialist.subtotal_needs_verification);
  if (subtotal != null && !hideSubtotal) {
    push({ label: "Subtotal", value: money(subtotal) });
  } else if (hideSubtotal) {
    push({
      label: "Subtotal",
      value: "Needs verification",
      confidence: 0.2,
      needs_verification: true,
      source_type: "ai_suggestion",
    });
  }
  const tax = asNumber(specialist.tax);
  if (tax != null) push({ label: "Tax", value: money(tax) });

  const total = asNumber(specialist.total_amount_due);
  const hideTotal =
    specialist.total_amount_due_display === null ||
    (Boolean(specialist.total_amount_due_needs_verification) &&
      (asNumber(specialist.total_amount_due_confidence) ?? 1) < 0.75);

  if (total != null && !hideTotal) {
    push({
      label: "Total amount due",
      value: money(total),
      confidence: Number(specialist.total_amount_due_confidence) || 0.9,
      needs_verification: Boolean(specialist.total_amount_due_needs_verification),
    });
  } else {
    push({
      label: "Total amount due",
      value: "Needs verification",
      confidence: 0.2,
      needs_verification: true,
      source_type: "ai_suggestion",
    });
  }

  const direction = String(specialist.payment_direction ?? "unknown");
  push({
    label: "Payment direction",
    value:
      direction === "receivable"
        ? "Receivable (you are the issuer)"
        : direction === "payable"
          ? "Payable (you are billed)"
          : "Unknown — confirm whether you pay or receive",
    source_type: "calculated",
    confidence: direction === "unknown" ? 0.5 : 0.95,
    needs_verification: direction === "unknown",
  });

  return facts;
}

function hourlyMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr`;
}

/** Per-line facts with explicit rate provenance (document vs calculated/inferred). */
export function buildInvoiceLineItemFacts(
  specialist: Record<string, unknown>
): ExtractedFact[] {
  const lineItems = Array.isArray(specialist.line_items)
    ? (specialist.line_items as Record<string, unknown>[])
    : [];
  if (lineItems.length === 0) return [];

  const facts: ExtractedFact[] = [];
  const push = (partial: Partial<ExtractedFact> & { label: string; value: string }) => {
    const f = normalizeFact({
      source_type: "document",
      confidence: 0.9,
      source_excerpt: "",
      page_number: null,
      needs_verification: false,
      date: null,
      is_deadline: false,
      is_past_event: false,
      ...partial,
    });
    if (f) facts.push(f);
  };

  for (const item of lineItems) {
    const name = String(item.contractor ?? item.person_or_service ?? "Line item");
    const hours = asNumber(item.hours) ?? asNumber(item.quantity);
    const rate = asNumber(item.rate) ?? asNumber(item.unit_rate);
    const amount = asNumber(item.amount) ?? asNumber(item.line_total);
    const rateSource = (item.rate_source as InvoiceRateSource | undefined) ?? "document";
    const rateNeedsVerification = Boolean(item.rate_needs_verification);
    const impliedRate = asNumber(item.implied_rate);
    const showImpliedRate =
      impliedRate != null &&
      isPlausibleHourlyRate(impliedRate) &&
      (rate == null || (rateNeedsVerification && !approxEqual(impliedRate, rate)));

    if (hours != null) {
      push({
        label: `${name} — hours`,
        value: String(hours),
        confidence: asNumber(item.confidence) ?? 0.9,
        needs_verification: (asNumber(item.confidence) ?? 0.9) < 0.75,
      });
    }

    if (amount != null && !Boolean(item.amount_needs_verification)) {
      push({
        label: `${name} — line amount`,
        value: `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        confidence: asNumber(item.confidence) ?? 0.9,
      });
    }

    if (rate != null && rateSource === "document") {
      const mathOk = !rateNeedsVerification || !showImpliedRate;
      push({
        label: mathOk ? `${name} — rate` : `${name} — rate (from document)`,
        value: hourlyMoney(rate),
        confidence: rateNeedsVerification ? 0.4 : asNumber(item.confidence) ?? 0.9,
        needs_verification: rateNeedsVerification,
      });
    }

    if (rate != null && rateSource === "inferred") {
      push({
        label: `${name} — rate (inferred from line total ÷ hours)`,
        value: hourlyMoney(rate),
        source_type: "calculated",
        confidence: 0.75,
        needs_verification: true,
      });
    }

    if (showImpliedRate) {
      push({
        label: `${name} — rate (calculated from line total ÷ hours)`,
        value: hourlyMoney(impliedRate!),
        source_type: "calculated",
        confidence: 0.85,
        needs_verification: true,
      });
    }
  }

  return facts;
}
