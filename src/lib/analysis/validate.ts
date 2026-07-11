import type { GuardianAnalysis, GuardianStatus } from "./types";
import { CONFIDENCE_MEDIUM } from "./types";
import { daysRelativeTo } from "./dates";

const MONEY_TOLERANCE = 0.02;

function approxEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= MONEY_TOLERANCE;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Deterministic validation after AI extraction. Never silently corrects values. */
export function validateAnalysis(result: GuardianAnalysis): GuardianAnalysis {
  const warnings = [...result.warnings];
  let overall = result.overall_confidence;
  const specialist = { ...result.specialist };

  if (result.document_type === "invoice") {
    const lineItems = Array.isArray(specialist.line_items)
      ? (specialist.line_items as Record<string, unknown>[])
      : [];

    for (const item of lineItems) {
      const qty = asNumber(item.quantity) ?? asNumber(item.hours);
      const rate = asNumber(item.unit_rate);
      const lineTotal = asNumber(item.line_total);
      if (qty != null && rate != null && lineTotal != null) {
        const expected = Math.round(qty * rate * 100) / 100;
        if (!approxEqual(expected, lineTotal)) {
          warnings.push(
            `A line item total (${lineTotal}) does not match quantity/hours × rate (${expected}).`
          );
          overall = Math.min(overall, 0.7);
        }
      }
    }

    const lineSum = lineItems.reduce((sum, item) => {
      const t = asNumber(item.line_total);
      return t == null ? sum : sum + t;
    }, 0);
    const subtotal = asNumber(specialist.subtotal);
    if (lineItems.length > 0 && subtotal != null && !approxEqual(lineSum, subtotal)) {
      warnings.push(
        `Sum of line totals (${lineSum.toFixed(2)}) does not approximately equal subtotal (${subtotal}).`
      );
      overall = Math.min(overall, 0.7);
    }

    const tax = asNumber(specialist.tax) ?? 0;
    const discount = asNumber(specialist.discount) ?? 0;
    const total = asNumber(specialist.total_amount_due);
    if (subtotal != null && total != null) {
      const expected = Math.round((subtotal + tax - discount) * 100) / 100;
      if (!approxEqual(expected, total)) {
        warnings.push(
          `Subtotal + tax − discount (${expected}) does not approximately equal total amount due (${total}).`
        );
        overall = Math.min(overall, 0.7);
      }
    }

    const invoiceDate = asDate(specialist.invoice_date);
    const dueDate = asDate(specialist.due_date);
    if (invoiceDate && dueDate && dueDate < invoiceDate) {
      warnings.push("Due date appears to precede the invoice date.");
      overall = Math.min(overall, 0.65);
    }
  }

  if (result.document_type === "receipt") {
    const items = Array.isArray(specialist.items)
      ? (specialist.items as Record<string, unknown>[])
      : [];
    const itemSum = items.reduce((sum, item) => {
      const t = asNumber(item.line_total);
      return t == null ? sum : sum + t;
    }, 0);
    const subtotal = asNumber(specialist.subtotal);
    if (items.length > 0 && subtotal != null && !approxEqual(itemSum, subtotal)) {
      warnings.push(
        `Sum of item totals (${itemSum.toFixed(2)}) does not approximately equal subtotal (${subtotal}).`
      );
      overall = Math.min(overall, 0.7);
    }
    const tax = asNumber(specialist.tax) ?? 0;
    const tip = asNumber(specialist.tip) ?? 0;
    const total = asNumber(specialist.total);
    if (subtotal != null && total != null) {
      const expected = Math.round((subtotal + tax + tip) * 100) / 100;
      if (!approxEqual(expected, total)) {
        warnings.push(
          `Subtotal + tax + tip (${expected}) does not approximately equal total (${total}).`
        );
        overall = Math.min(overall, 0.7);
      }
    }
  }

  if (result.document_type === "insurance") {
    const effective = asDate(specialist.effective_date);
    const expiration = asDate(specialist.expiration_date);
    if (effective && expiration && expiration < effective) {
      warnings.push("Expiration date appears to precede the effective date.");
      overall = Math.min(overall, 0.65);
    }
  }

  if (result.document_type === "contract") {
    const start = asDate(specialist.start_date) ?? asDate(specialist.effective_date);
    const end = asDate(specialist.end_date);
    if (start && end && end < start) {
      warnings.push("End date appears to precede the start date.");
      overall = Math.min(overall, 0.65);
    }
  }

  const guardian_status = deriveGuardianStatus(
    { ...result, warnings, overall_confidence: overall },
    overall
  );

  return {
    ...result,
    warnings,
    overall_confidence: overall,
    guardian_status,
    specialist,
  };
}

export function deriveGuardianStatus(
  result: GuardianAnalysis,
  overall = result.overall_confidence
): GuardianStatus {
  if (overall < CONFIDENCE_MEDIUM) return "needs_verification";

  const deadlines = [
    ...result.important_dates.filter((d) => d.is_deadline && d.date && !d.needs_verification),
    ...result.facts.filter((d) => d.is_deadline && d.date && !d.needs_verification),
  ].filter((d) => (d.confidence ?? 1) >= CONFIDENCE_MEDIUM);

  let hasUpcoming = false;
  let hasOverdue = false;

  for (const d of deadlines) {
    if (!d.date) continue;
    const days = daysRelativeTo(d.date);
    if (days < 0) hasOverdue = true;
    else if (days <= 30) hasUpcoming = true;
  }

  // Insurance-specific: expired / renewal within 30 days from specialist fields
  if (result.document_type === "insurance") {
    const expiration = asDate(result.specialist.expiration_date);
    const renewal = asDate(result.specialist.renewal_date);
    const check = renewal ?? expiration;
    if (check) {
      const days = daysRelativeTo(check);
      if (days < 0) return "action_needed";
      if (days <= 30) return "upcoming";
      return "protected";
    }
  }

  if (hasOverdue) return "action_needed";
  if (hasUpcoming) return "upcoming";
  if (result.warnings.length > 2) return "needs_verification";
  return "protected";
}
