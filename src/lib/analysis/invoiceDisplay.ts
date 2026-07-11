import type { ExtractedFact } from "./types";
import { normalizeFact } from "./normalize";

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

  if (specialist.issuer) push({ label: "Issuer", value: String(specialist.issuer) });
  if (specialist.billed_to) push({ label: "Billed to", value: String(specialist.billed_to) });

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
  if (subtotal != null) push({ label: "Subtotal", value: money(subtotal) });
  const tax = asNumber(specialist.tax);
  if (tax != null) push({ label: "Tax", value: money(tax) });

  const total = asNumber(specialist.total_amount_due);
  if (total != null) {
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
