import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreExtractionQuality } from "../extract-quality.ts";
import { sanitizeInvoiceNumber } from "../invoiceSanitize.ts";
import { validateAnalysis } from "../validate.ts";
import { toDisplayFacts } from "../display.ts";
import type { GuardianAnalysis } from "../types.ts";
import {
  NM2TECH_INVOICE_EXPECTED,
  NM2TECH_INVOICE_FIXTURE_TEXT,
} from "./fixtures/nm2tech-invoice.ts";

describe("native extraction quality", () => {
  it("scores the NM2TECH fixture text as usable (OCR not required)", () => {
    const score = scoreExtractionQuality(NM2TECH_INVOICE_FIXTURE_TEXT);
    assert.ok(score >= 0.45, `expected quality >= 0.45, got ${score}`);
  });

  it("fixture text contains invoice number and totals without missing digits", () => {
    assert.match(NM2TECH_INVOICE_FIXTURE_TEXT, /#0000016/);
    assert.match(NM2TECH_INVOICE_FIXTURE_TEXT, /16128/);
    assert.match(NM2TECH_INVOICE_FIXTURE_TEXT, /71628/);
    assert.doesNotMatch(NM2TECH_INVOICE_FIXTURE_TEXT, /\b1628\b/);
  });
});

describe("invoice number rules", () => {
  it("preserves leading zeros", () => {
    const r = sanitizeInvoiceNumber("#0000016", 0.95, "2026-07-07");
    assert.equal(r.value, "#0000016");
    assert.equal(r.needsVerification, false);
  });

  it("rejects hours mistaken for invoice numbers", () => {
    const r = sanitizeInvoiceNumber("168", 0.9, "2026-07-07");
    assert.equal(r.value, null);
    assert.equal(r.needsVerification, true);
  });
});

describe("NM2TECH invoice math validation regression", () => {
  it("flags missing-digit line amounts and shows calculated correction separately", () => {
    // Simulate corrupted AI extraction (1628 instead of 16128) from bad vision OCR
    const corrupted: GuardianAnalysis = {
      document_type: "invoice",
      title: "Invoice",
      summary: "Services invoice",
      facts: [],
      important_dates: [],
      people: [],
      organizations: [],
      amounts: [],
      obligations: [],
      warnings: [],
      guardian_status: "protected",
      suggested_actions: [],
      overall_confidence: 0.9,
      specialist: {
        invoice_number: NM2TECH_INVOICE_EXPECTED.invoice_number,
        invoice_date: NM2TECH_INVOICE_EXPECTED.invoice_date,
        due_date: NM2TECH_INVOICE_EXPECTED.due_date,
        issuer: NM2TECH_INVOICE_EXPECTED.issuer,
        billed_to: NM2TECH_INVOICE_EXPECTED.billed_to,
        subtotal: 1628,
        total_amount_due: 1628,
        total_amount_due_confidence: 0.9,
        currency: "USD",
        payment_direction: "unknown",
        line_items: [
          {
            contractor: "Daniel Tata",
            hours: 168,
            rate: 96,
            amount: 1628, // corrupted
            confidence: 0.9,
          },
          {
            contractor: "Frank Damico",
            hours: 177,
            rate: 100,
            amount: 17700,
            confidence: 0.9,
          },
          {
            contractor: "Reginald Jones",
            hours: 168,
            rate: 105,
            amount: 17640,
            confidence: 0.9,
          },
          {
            contractor: "Patrick Spears",
            hours: 168,
            rate: 120,
            amount: 20160,
            confidence: 0.9,
          },
        ],
      },
    };

    const validated = validateAnalysis(corrupted);
    assert.ok(
      validated.warnings.some((w) => /Daniel Tata/i.test(w) && /16128/.test(w))
    );
    assert.equal(validated.specialist.total_amount_due_needs_verification, true);

    const facts = toDisplayFacts(validated, "UTC");
    const danielCalc = facts.find(
      (f) => f.source === "calculated" && /Daniel Tata/i.test(f.label)
    );
    assert.ok(danielCalc);
    assert.match(danielCalc!.value, /16,?128/);
    assert.equal(danielCalc!.source, "calculated");

    // Expected correct math for all four contractors
    for (const line of NM2TECH_INVOICE_EXPECTED.lines) {
      const expected = line.hours * line.rate;
      assert.equal(expected, line.amount);
    }
    assert.equal(
      NM2TECH_INVOICE_EXPECTED.lines.reduce((s, l) => s + l.amount, 0),
      NM2TECH_INVOICE_EXPECTED.total_amount_due
    );
  });

  it("accepts correct line math without false warnings", () => {
    const good: GuardianAnalysis = {
      document_type: "invoice",
      title: "Invoice",
      summary: "Services invoice",
      facts: [],
      important_dates: [],
      people: [],
      organizations: [],
      amounts: [],
      obligations: [],
      warnings: [],
      guardian_status: "protected",
      suggested_actions: [],
      overall_confidence: 0.95,
      specialist: {
        invoice_number: "#0000016",
        invoice_date: "2026-07-07",
        due_date: "2026-08-05",
        issuer: "NM2TECH LLC",
        billed_to: "Onyx Government Services, LLC",
        subtotal: 71628,
        total_amount_due: 71628,
        total_amount_due_confidence: 0.95,
        currency: "USD",
        payment_direction: "receivable",
        line_items: NM2TECH_INVOICE_EXPECTED.lines.map((l) => ({
          contractor: l.contractor,
          hours: l.hours,
          rate: l.rate,
          amount: l.amount,
          confidence: 0.95,
        })),
      },
    };

    const validated = validateAnalysis(good);
    assert.equal(validated.specialist.total_amount_due_needs_verification, false);
    assert.ok(!validated.warnings.some((w) => /needs verification \(document/.test(w)));
  });
});
