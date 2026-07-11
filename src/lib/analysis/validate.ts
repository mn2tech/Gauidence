import type { GuardianAnalysis, GuardianStatus } from "./types";
import { CONFIDENCE_MEDIUM } from "./types";
import { daysRelativeTo } from "./dates";
import { buildInvoiceCanonicalFacts } from "./invoiceDisplay";

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

    const calculatedFacts: GuardianAnalysis["facts"] = [];
    let calculatedSum = 0;
    let calculatedCount = 0;
    let lineItemVerificationWarned = false;

    for (const item of lineItems) {
      const hours = asNumber(item.hours) ?? asNumber(item.quantity);
      const rate = asNumber(item.rate) ?? asNumber(item.unit_rate);
      const amount = asNumber(item.amount) ?? asNumber(item.line_total);
      const itemConfidence = asNumber(item.confidence) ?? 0;
      const name = String(item.contractor ?? item.person_or_service ?? "Line item");

      if (hours != null && rate != null) {
        const expected = Math.round(hours * rate * 100) / 100;
        item.calculated_amount = expected;
        calculatedSum += expected;
        calculatedCount += 1;

        if (amount != null && !approxEqual(expected, amount)) {
          // Do not display the bad amount as high-confidence document fact
          item.amount_needs_verification = true;
          item.line_total_needs_verification = true;
          item.confidence = Math.min(itemConfidence, 0.4);
          calculatedFacts.push({
            label: `${name} — amount`,
            value: "Needs verification",
            source_type: "document",
            confidence: 0.2,
            source_excerpt: String(amount),
            page_number: null,
            needs_verification: true,
          });
          calculatedFacts.push({
            label: `${name} — calculated`,
            value: `${hours} hours × $${rate} = $${expected.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            source_type: "calculated",
            confidence: 1,
            source_excerpt: "",
            page_number: null,
            needs_verification: false,
          });
          warnings.push(
            `Line amount for ${name} needs verification (document showed ${amount}; ${hours} × ${rate} = ${expected}).`
          );
          overall = Math.min(overall, 0.65);
        }
      } else if (
        itemConfidence < CONFIDENCE_MEDIUM &&
        (hours != null || rate != null || amount != null) &&
        !lineItemVerificationWarned
      ) {
        warnings.push("Line item values need verification.");
        lineItemVerificationWarned = true;
      }
    }

    specialist.line_items = lineItems;
    if (calculatedCount > 0) {
      specialist.calculated_line_sum = Math.round(calculatedSum * 100) / 100;
    }

    const subtotal = asNumber(specialist.subtotal);
    const total = asNumber(specialist.total_amount_due);
    const tax = asNumber(specialist.tax) ?? 0;
    const discount = asNumber(specialist.discount) ?? 0;

    if (calculatedCount > 0) {
      const calcSum = Math.round(calculatedSum * 100) / 100;
      if (subtotal != null && !approxEqual(calcSum, subtotal)) {
        specialist.subtotal_needs_verification = true;
        warnings.push(
          `Subtotal needs verification (document ${subtotal}; sum of hours × rate = ${calcSum}).`
        );
        overall = Math.min(overall, 0.65);
      }
      if (total != null && !approxEqual(calcSum + tax - discount, total)) {
        // Strong conflict with mathematically validated lines — do not show total confidently
        specialist.total_amount_due_needs_verification = true;
        specialist.total_amount_due_confidence = Math.min(
          asNumber(specialist.total_amount_due_confidence) ?? 1,
          0.4
        );
        warnings.push(
          `Total amount due needs verification (document ${total}; validated line math ≈ ${Math.round((calcSum + tax - discount) * 100) / 100}).`
        );
        overall = Math.min(overall, 0.65);
        // Prefer not displaying a confidently wrong total
        if (Math.abs(total - calcSum) / Math.max(calcSum, 1) > 0.05) {
          specialist.total_amount_due_display = null;
        }
      } else if (total != null && approxEqual(calcSum + tax - discount, total)) {
        specialist.total_amount_due_confidence = Math.max(
          asNumber(specialist.total_amount_due_confidence) ?? 0,
          0.95
        );
        specialist.total_amount_due_needs_verification = false;
      }
    }

    const invoiceDate = asDate(specialist.invoice_date);
    const dueDate = asDate(specialist.due_date);
    if (invoiceDate && dueDate && dueDate < invoiceDate) {
      warnings.push("Due date appears to precede the invoice date.");
      overall = Math.min(overall, 0.65);
    }

    // Completeness: extracted rows vs estimated rows in source text
    const estimatedRows = asNumber(specialist.__extraction_estimated_line_rows);
    if (
      estimatedRows != null &&
      estimatedRows >= 3 &&
      lineItems.length > 0 &&
      lineItems.length < estimatedRows
    ) {
      warnings.push(
        "Some invoice line items may not have been extracted completely."
      );
      overall = Math.min(overall, 0.65);
    }

    // Rebuild invoice facts: document fields + calculated line math (never mix).
    const guardian_status = deriveGuardianStatus(
      { ...result, warnings, overall_confidence: overall, specialist },
      overall
    );
    return {
      ...result,
      facts: [...buildInvoiceCanonicalFacts(specialist), ...calculatedFacts],
      warnings,
      overall_confidence: overall,
      specialist,
      guardian_status,
    };
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
