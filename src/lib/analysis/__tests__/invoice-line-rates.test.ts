import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyLineItemRate,
  impliedHourlyRate,
  applyLineItemRateClassification,
} from "../invoiceLineRates.ts";
import { buildInvoiceLineItemFacts } from "../invoiceDisplay.ts";
import { validateAnalysis } from "../validate.ts";
import { toDisplayFacts } from "../display.ts";
import type { GuardianAnalysis } from "../types.ts";

describe("invoice line rate classification", () => {
  it("marks OCR/read rates as document when hours × rate matches line amount", () => {
    const result = classifyLineItemRate({
      hours: 168,
      rate: 96,
      amount: 16128,
      confidence: 0.95,
      rate_source: "document",
    });
    assert.equal(result.rate_source, "document");
    assert.equal(result.rate_needs_verification, false);
    assert.equal(result.implied_rate, null);
  });

  it("flags document rate and computes implied rate when math disagrees", () => {
    const result = classifyLineItemRate({
      hours: 168,
      rate: 71.2,
      amount: 11760,
      confidence: 0.9,
      rate_source: "document",
    });
    assert.equal(result.rate_source, "document");
    assert.equal(result.rate_needs_verification, true);
    assert.equal(result.implied_rate, 70);
  });

  it("infers rate from amount ÷ hours when rate column is missing", () => {
    const result = classifyLineItemRate({
      hours: 168,
      amount: 11760,
      confidence: 0.8,
    });
    assert.equal(result.rate_source, "inferred");
    assert.equal(result.rate_needs_verification, true);
    assert.equal(result.implied_rate, 70);
    assert.equal(impliedHourlyRate(168, 11760), 70);
  });
});

describe("invoice line item display facts", () => {
  it("shows document rate and calculated rate separately when they disagree", () => {
    const specialist = applyLineItemRateClassification({
      contractor: "Patrick Spears",
      hours: 168,
      rate: 71.2,
      amount: 11760,
      confidence: 0.9,
      rate_source: "document",
    });
    const facts = buildInvoiceLineItemFacts({
      line_items: [specialist],
    });

    const docRate = facts.find((f) => /rate \(from document\)/i.test(f.label));
    const calcRate = facts.find((f) =>
      /rate \(calculated from line total ÷ hours\)/i.test(f.label)
    );
    assert.ok(docRate);
    assert.match(docRate!.value, /71\.20\/hr/);
    assert.equal(docRate!.needs_verification, true);
    assert.ok(calcRate);
    assert.match(calcRate!.value, /70\.00\/hr/);
    assert.equal(calcRate!.source_type, "calculated");
  });

  it("shows a simple rate label when document rate matches line math", () => {
    const specialist = applyLineItemRateClassification({
      contractor: "Daniel Tata",
      hours: 168,
      rate: 96,
      amount: 16128,
      confidence: 0.95,
      rate_source: "document",
    });
    const facts = buildInvoiceLineItemFacts({ line_items: [specialist] });
    const rateFact = facts.find((f) => /Daniel Tata — rate$/i.test(f.label));
    assert.ok(rateFact);
    assert.match(rateFact!.value, /96\.00\/hr/);
    assert.equal(rateFact!.needs_verification, false);
    assert.equal(
      facts.some((f) => /calculated from line total/i.test(f.label)),
      false
    );
  });
});

describe("validateAnalysis invoice line facts", () => {
  it("includes line-item rate provenance in validated facts", () => {
    const analysis: GuardianAnalysis = {
      document_type: "invoice",
      title: "Invoice",
      summary: "Services",
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
        line_items: [
          {
            contractor: "Patrick Spears",
            hours: 168,
            rate: 71.2,
            amount: 11760,
            confidence: 0.9,
          },
        ],
        subtotal: 11760,
        total_amount_due: 11760,
        total_amount_due_confidence: 0.9,
        currency: "USD",
      },
    };

    const validated = validateAnalysis(analysis);
    const display = toDisplayFacts(validated, "UTC");
    assert.ok(
      display.some(
        (f) =>
          f.source === "document" &&
          /rate \(from document\)/i.test(f.label) &&
          /71\.20/.test(f.value)
      )
    );
    assert.ok(
      display.some(
        (f) =>
          f.source === "calculated" &&
          /calculated from line total ÷ hours/i.test(f.label) &&
          /70\.00/.test(f.value)
      )
    );
  });
});
