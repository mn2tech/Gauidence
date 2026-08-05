/**
 * Classify invoice line-item hourly rates as document-read vs inferred/calculated.
 */

const MONEY_TOLERANCE = 0.02;

export type InvoiceRateSource = "document" | "inferred";

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,$]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_TOLERANCE;
}

export function impliedHourlyRate(hours: number, amount: number): number {
  return Math.round((amount / hours) * 100) / 100;
}

/** Filter implied rates from corrupt line totals (e.g. missing-digit amounts). */
export function isPlausibleHourlyRate(rate: number): boolean {
  return rate >= 15 && rate <= 500;
}

export type LineItemRateClassification = {
  rate_source: InvoiceRateSource;
  rate_needs_verification: boolean;
  implied_rate: number | null;
};

/** Tag a line item with rate provenance after extraction / validation. */
export function classifyLineItemRate(
  item: Record<string, unknown>
): LineItemRateClassification {
  const hours = asNumber(item.hours) ?? asNumber(item.quantity);
  const rate = asNumber(item.rate) ?? asNumber(item.unit_rate);
  const amount = asNumber(item.amount) ?? asNumber(item.line_total);
  const confidence = asNumber(item.confidence) ?? 0.5;
  const existingSource = item.rate_source as InvoiceRateSource | undefined;

  if (hours != null && hours > 0 && amount != null) {
    const implied = impliedHourlyRate(hours, amount);

    if (rate == null) {
      return {
        rate_source: "inferred",
        rate_needs_verification: true,
        implied_rate: implied,
      };
    }

    if (!approxEqual(hours * rate, amount)) {
      return {
        rate_source: existingSource === "inferred" ? "inferred" : "document",
        rate_needs_verification: true,
        implied_rate: implied,
      };
    }

    return {
      rate_source: existingSource ?? "document",
      rate_needs_verification: confidence < 0.75,
      implied_rate: null,
    };
  }

  if (rate != null) {
    return {
      rate_source: existingSource ?? "document",
      rate_needs_verification: confidence < 0.75,
      implied_rate: null,
    };
  }

  return {
    rate_source: "inferred",
    rate_needs_verification: true,
    implied_rate: null,
  };
}

export function applyLineItemRateClassification(
  item: Record<string, unknown>
): Record<string, unknown> {
  const classified = classifyLineItemRate(item);
  return {
    ...item,
    rate_source: classified.rate_source,
    rate_needs_verification: classified.rate_needs_verification,
    implied_rate: classified.implied_rate,
  };
}
