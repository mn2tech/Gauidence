import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeDateString,
  resolvePaymentDirection,
  suggestionForPaymentDirection,
  normalizeCompanyName,
} from "../company.ts";
import { buildInvoiceCanonicalFacts } from "../invoiceDisplay.ts";
import { toDisplayFacts } from "../display.ts";
import { validateAnalysis } from "../validate.ts";
import type { GuardianAnalysis } from "../types.ts";

function invoiceBase(specialist: Record<string, unknown>): GuardianAnalysis {
  return {
    document_type: "invoice",
    title: "Invoice",
    summary: "Test invoice",
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
    specialist,
  };
}

describe("invoice number sanitization helpers", () => {
  it("rejects ISO dates as invoice numbers", () => {
    assert.equal(looksLikeDateString("2026-07-01"), true);
    assert.equal(looksLikeDateString("16"), false);
    assert.equal(looksLikeDateString("INV-16"), false);
  });
});

describe("payment direction", () => {
  it("does not infer NM2TECH from the invoice alone", () => {
    const direction = resolvePaymentDirection({
      issuer: "NM2TECH LLC",
      billedTo: "Onyx Government Services, LLC",
      companyName: null,
      fullName: null,
    });
    assert.equal(direction, "unknown");
    assert.match(suggestionForPaymentDirection(direction), /Confirm whether you are/);
  });

  it("marks receivable when profile company matches issuer", () => {
    const direction = resolvePaymentDirection({
      issuer: "NM2TECH LLC",
      billedTo: "Onyx Government Services, LLC",
      companyName: "NM2TECH, LLC",
      fullName: null,
    });
    assert.equal(direction, "receivable");
    assert.match(suggestionForPaymentDirection(direction), /Monitor for payment/);
  });

  it("marks payable when profile company matches billed party", () => {
    const direction = resolvePaymentDirection({
      issuer: "NM2TECH LLC",
      billedTo: "Onyx Government Services, LLC",
      companyName: "Onyx Government Services LLC",
      fullName: null,
    });
    assert.equal(direction, "payable");
    assert.match(suggestionForPaymentDirection(direction), /prepare for payment/);
  });

  it("normalizes LLC punctuation", () => {
    assert.equal(normalizeCompanyName("NM2TECH, LLC"), "nm2tech llc");
    assert.equal(normalizeCompanyName("Onyx Government Services, LLC"), "onyx government services llc");
  });
});

describe("invoice display dedupe", () => {
  it("shows each canonical field once even if generic facts duplicate", () => {
    const analysis = invoiceBase({
      invoice_number: "16",
      invoice_number_confidence: 0.95,
      issuer: "NM2TECH LLC",
      billed_to: "Onyx Government Services, LLC",
      invoice_date: "2026-07-01",
      due_date: "2026-07-31",
      payment_terms: "Net 30",
      subtotal: 1000,
      tax: null,
      total_amount_due: 1000,
      total_amount_due_confidence: 0.95,
      currency: "USD",
      payment_direction: "receivable",
    });
    // Simulate bad AI duplicates in generic arrays
    analysis.facts = [
      {
        label: "Invoice date",
        value: "2026-07-01",
        source_type: "document",
        confidence: 0.9,
        source_excerpt: "",
        page_number: null,
        needs_verification: false,
        date: "2026-07-01",
        is_past_event: true,
      },
      {
        label: "Invoice date",
        value: "2026-07-01 again",
        source_type: "document",
        confidence: 0.9,
        source_excerpt: "",
        page_number: null,
        needs_verification: false,
        date: "2026-07-01",
        is_past_event: true,
      },
    ];
    analysis.important_dates = [
      {
        label: "Due date",
        value: "2026-07-31",
        source_type: "document",
        confidence: 0.9,
        source_excerpt: "",
        page_number: null,
        needs_verification: false,
        date: "2026-07-31",
        is_deadline: true,
      },
    ];
    analysis.amounts = [
      {
        label: "Total amount due",
        value: "1628",
        source_type: "document",
        confidence: 0.9,
        source_excerpt: "",
        page_number: null,
        needs_verification: false,
      },
    ];
    analysis.suggested_actions = [
      suggestionForPaymentDirection("receivable"),
    ];

    const facts = toDisplayFacts(analysis, "UTC");
    const labels = facts
      .filter((f) => f.label !== "Suggestion" && f.label !== "Warning")
      .map((f) => f.label.replace(/\s*\(Needs verification\)/, ""));

    assert.equal(labels.filter((l) => l === "Invoice date").length, 1);
    assert.equal(labels.filter((l) => l === "Due date").length, 1);
    assert.equal(labels.filter((l) => l === "Total amount due").length, 1);
    assert.equal(labels.filter((l) => l === "Invoice number").length, 1);
    assert.ok(!facts.some((f) => f.label.startsWith("Invoice number") && f.value === "2026-07-01"));
    assert.ok(facts.some((f) => f.source === "ai_generated" && /Monitor for payment/.test(f.value)));
  });

  it("does not use a date as invoice number in canonical facts", () => {
    const facts = buildInvoiceCanonicalFacts({
      invoice_number: null,
      invoice_number_needs_verification: true,
      issuer: "NM2TECH LLC",
      billed_to: "Onyx Government Services, LLC",
      invoice_date: "2026-07-01",
      due_date: "2026-07-31",
      total_amount_due: null,
      total_amount_due_needs_verification: true,
      currency: "USD",
      payment_direction: "unknown",
    });
    const inv = facts.find((f) => f.label === "Invoice number");
    assert.ok(inv);
    assert.notEqual(inv!.value, "2026-07-01");
    assert.equal(inv!.needs_verification, true);
  });
});

describe("invoice validation confidence gate", () => {
  it("flags hours×rate mismatches even when line confidence is low", () => {
    const result = validateAnalysis(
      invoiceBase({
        line_items: [
          {
            description: "Work",
            hours: 10,
            unit_rate: 100,
            line_total: 500,
            confidence: 0.4,
          },
        ],
        subtotal: 500,
        total_amount_due: 500,
        total_amount_due_confidence: 0.9,
      })
    );
    assert.ok(result.warnings.some((w) => /10 × 100 = 1000/.test(w)));
    assert.equal(result.specialist.total_amount_due_needs_verification, true);
  });
});
