import { looksLikeDateString } from "./company";

function looksLikeHoursOrAmountAsInvoiceNo(value: string): boolean {
  const cleaned = value.replace(/^#/, "").trim();
  // Keep identifiers with leading zeros (0000016)
  if (/^0+\d+$/.test(cleaned)) return false;
  // Bare 1–3 digit numbers are usually hours/qty, not invoice IDs
  if (/^\d{1,3}$/.test(cleaned)) return true;
  return false;
}

export function sanitizeInvoiceNumber(
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
  let value = String(raw).trim();
  // Preserve leading zeros; normalize optional missing #
  if (/^0+\d+$/.test(value)) value = `#${value}`;

  if (!value) {
    return {
      value: null,
      confidence: 0,
      needsVerification: true,
      warning: "Invoice number needs verification.",
    };
  }
  if (
    looksLikeDateString(value) ||
    (invoiceDate && value === invoiceDate) ||
    looksLikeHoursOrAmountAsInvoiceNo(value)
  ) {
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
