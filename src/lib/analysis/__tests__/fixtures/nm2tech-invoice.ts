/**
 * Regression fixture: synthetic native text for the NM2TECH invoice.
 * Production code must NEVER hardcode these values — tests only.
 */
export const NM2TECH_INVOICE_FIXTURE_TEXT = `
NM2TECH LLC
Invoice

Invoice #: #0000016
Date: 2026-07-07
Due: 2026-08-05

Bill To:
Onyx Government Services, LLC

CONTRACTOR | DESCRIPTION | HOURS | RATE | AMOUNT
Daniel Tata | Consulting | 168 | 96.00 | 16128.00
Frank Damico | Consulting | 177 | 100.00 | 17700.00
Reginald Jones | Consulting | 168 | 105.00 | 17640.00
Patrick Spears | Consulting | 168 | 120.00 | 20160.00

Subtotal: 71628.00
Total Due: 71628.00
`.trim();

export const NM2TECH_INVOICE_EXPECTED = {
  invoice_number: "#0000016",
  invoice_date: "2026-07-07",
  due_date: "2026-08-05",
  issuer: "NM2TECH LLC",
  billed_to: "Onyx Government Services, LLC",
  lines: [
    { contractor: "Daniel Tata", hours: 168, rate: 96, amount: 16128 },
    { contractor: "Frank Damico", hours: 177, rate: 100, amount: 17700 },
    { contractor: "Reginald Jones", hours: 168, rate: 105, amount: 17640 },
    { contractor: "Patrick Spears", hours: 168, rate: 120, amount: 20160 },
  ],
  subtotal: 71628,
  total_amount_due: 71628,
} as const;
