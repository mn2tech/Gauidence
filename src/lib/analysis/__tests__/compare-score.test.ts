import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreInvoiceAccuracy,
  formatAccuracyTable,
} from "../compare/score.ts";
import type { GuardianAnalysis } from "../types.ts";
import { NM2TECH_INVOICE_EXPECTED } from "./fixtures/nm2tech-invoice.ts";

function analysisFromExpected(): GuardianAnalysis {
  const e = NM2TECH_INVOICE_EXPECTED;
  return {
    document_type: "invoice",
    title: "Invoice",
    summary: "test",
    facts: [],
    important_dates: [],
    people: [],
    organizations: [],
    amounts: [],
    obligations: [],
    warnings: [],
    suggested_actions: [],
    overall_confidence: 0.9,
    guardian_status: "ok",
    specialist: {
      invoice_number: e.invoice_number,
      invoice_date: e.invoice_date,
      due_date: e.due_date,
      issuer: e.issuer,
      billed_to: e.billed_to,
      subtotal: e.subtotal,
      total_amount_due: e.total_amount_due,
      line_items: e.lines.map((l) => ({
        contractor: l.contractor,
        description: "Consulting",
        hours: l.hours,
        rate: l.rate,
        amount: l.amount,
        confidence: 0.9,
      })),
    },
  };
}

describe("dual-analyzer accuracy scorer", () => {
  it("scores a perfect extraction at 100%", () => {
    const report = scoreInvoiceAccuracy(
      "openai_visual",
      analysisFromExpected(),
      NM2TECH_INVOICE_EXPECTED
    );
    assert.equal(report.pct, 100);
    assert.equal(report.matched, report.total);
    assert.equal(report.mathOk, true);
  });

  it("flags missing digits and wrong invoice number", () => {
    const bad = analysisFromExpected();
    bad.specialist.invoice_number = "#000016";
    bad.specialist.total_amount_due = 712.62;
    bad.specialist.line_items = [
      {
        contractor: "Daniel Tata",
        hours: 168,
        rate: 96,
        amount: 1628,
        confidence: 0.5,
      },
    ];
    bad.warnings = ["Line total does not match hours × rate (missing digit?)."];

    const report = scoreInvoiceAccuracy(
      "claude_pdf",
      bad,
      NM2TECH_INVOICE_EXPECTED
    );
    assert.ok(report.pct < 100);
    assert.equal(report.mathOk, false);
    assert.ok(report.checks.some((c) => c.field === "invoice_number" && !c.ok));
    assert.ok(
      report.checks.some((c) => c.field === "total_amount_due" && !c.ok)
    );
  });

  it("formats a comparison table for two arms", () => {
    const a = scoreInvoiceAccuracy(
      "openai_visual",
      analysisFromExpected(),
      NM2TECH_INVOICE_EXPECTED
    );
    const b = scoreInvoiceAccuracy(
      "claude_pdf",
      analysisFromExpected(),
      NM2TECH_INVOICE_EXPECTED
    );
    const table = formatAccuracyTable([a, b]);
    assert.match(table, /openai_visual/);
    assert.match(table, /claude_pdf/);
    assert.match(table, /100%/);
  });
});
