/** Normalize org names for payment-direction matching. */
export function normalizeCompanyName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .replace(/\b(limited liability company)\b/g, "llc")
    .replace(/\b(incorporated|corporation)\b/g, "inc")
    .replace(/\b(company)\b/g, "co")
    .replace(/\b(ltd|llc|inc|corp|co)\b\.?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function companyNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** True when a value looks like an ISO / common date rather than an invoice #. */
export function looksLikeDateString(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v)) return true;
  if (/^[A-Za-z]+ \d{1,2},?\s+\d{4}$/.test(v)) return true;
  return false;
}

export type PaymentDirection = "receivable" | "payable" | "unknown";

export function resolvePaymentDirection(args: {
  issuer: string;
  billedTo: string;
  companyName?: string | null;
  fullName?: string | null;
}): PaymentDirection {
  const { issuer, billedTo, companyName, fullName } = args;
  // Prefer organization identity; do not infer company from the invoice alone.
  if (companyName && companyNamesMatch(companyName, issuer)) return "receivable";
  if (companyName && companyNamesMatch(companyName, billedTo)) return "payable";
  // Soft personal-name match only when company is unset — still conservative.
  if (!companyName && fullName) {
    if (companyNamesMatch(fullName, issuer)) return "receivable";
    if (companyNamesMatch(fullName, billedTo)) return "payable";
  }
  return "unknown";
}

export function suggestionForPaymentDirection(direction: PaymentDirection): string {
  if (direction === "receivable") {
    return "Monitor for payment. If payment has not been received by the due date, Guardian can help prepare a professional follow-up.";
  }
  if (direction === "payable") {
    return "Review the invoice details and prepare for payment by the due date.";
  }
  return "Confirm whether you are the payer or payment recipient before taking action.";
}
