import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateRelativeLabel, daysRelativeTo } from "../dates.ts";
import { validateAnalysis, deriveGuardianStatus } from "../validate.ts";
import { resolveAnalyzerType } from "../route.ts";
import { toDisplayFacts, collectDeadlines } from "../display.ts";
import type { GuardianAnalysis, Classification } from "../types.ts";
import { IMPLEMENTED_SPECIALISTS } from "../types.ts";

function base(partial: Partial<GuardianAnalysis>): GuardianAnalysis {
  return {
    document_type: "general",
    title: "Test",
    summary: "Summary",
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
    specialist: {},
    ...partial,
  };
}

describe("date display", () => {
  it("uses past-tense for past events, not time remaining", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const label = formatDateRelativeLabel("2026-07-01", "past_event", now, "UTC");
    assert.match(label, /ago/);
    assert.doesNotMatch(label, /remaining/);
  });

  it("uses countdown language only for future deadlines", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const label = formatDateRelativeLabel("2026-07-31", "deadline", now, "UTC");
    assert.match(label, /remaining/);
    assert.equal(daysRelativeTo("2026-07-31", now, "UTC"), 20);
  });

  it("keeps the civil calendar day in Eastern (no UTC midnight shift)", () => {
    const now = new Date("2026-07-20T16:00:00Z"); // afternoon ET
    const label = formatDateRelativeLabel(
      "2026-07-20",
      "deadline",
      now,
      "America/New_York"
    );
    assert.match(label, /July 20, 2026/);
    assert.match(label, /due today/);
    assert.doesNotMatch(label, /July 19/);
  });
});

describe("router", () => {
  it("routes low confidence to general", () => {
    const c: Classification = {
      document_type: "invoice",
      document_subtype: "",
      classification_confidence: 0.5,
      classification_reason: "uncertain",
    };
    assert.equal(resolveAnalyzerType(c, IMPLEMENTED_SPECIALISTS), "general");
  });

  it("routes passport/tax stubs to general even at high confidence", () => {
    const c: Classification = {
      document_type: "passport",
      document_subtype: "",
      classification_confidence: 0.95,
      classification_reason: "looks like passport",
    };
    assert.equal(resolveAnalyzerType(c, IMPLEMENTED_SPECIALISTS), "general");
  });

  it("routes high-confidence invoice to invoice analyzer", () => {
    const c: Classification = {
      document_type: "invoice",
      document_subtype: "services",
      classification_confidence: 0.92,
      classification_reason: "labeled invoice",
    };
    assert.equal(resolveAnalyzerType(c, IMPLEMENTED_SPECIALISTS), "invoice");
  });
});

describe("invoice validation", () => {
  it("warns when line totals do not match hours × rate", () => {
    const result = validateAnalysis(
      base({
        document_type: "invoice",
        specialist: {
          line_items: [
            {
              description: "Consulting",
              hours: 10,
              unit_rate: 100,
              line_total: 500,
              confidence: 0.9,
            },
          ],
          subtotal: 500,
          total_amount_due: 500,
        },
      })
    );
    assert.ok(result.warnings.some((w) => /needs verification/i.test(w) && /10 × 100 = 1000/.test(w)));
    assert.equal(result.specialist.total_amount_due_needs_verification, true);
  });

  it("warns when due date precedes invoice date", () => {
    const result = validateAnalysis(
      base({
        document_type: "invoice",
        specialist: {
          invoice_date: "2026-07-10",
          due_date: "2026-07-01",
          line_items: [],
        },
      })
    );
    assert.ok(result.warnings.some((w) => /due date/i.test(w)));
  });

  it("does not invent receivable direction in validation", () => {
    const result = validateAnalysis(
      base({
        document_type: "invoice",
        specialist: {
          payment_direction: "unknown",
          line_items: [],
        },
      })
    );
    assert.equal(result.specialist.payment_direction, "unknown");
  });
});

describe("receipt validation", () => {
  it("warns when subtotal + tax + tip != total", () => {
    const result = validateAnalysis(
      base({
        document_type: "receipt",
        specialist: {
          items: [],
          subtotal: 10,
          tax: 1,
          tip: 2,
          total: 20,
        },
      })
    );
    assert.ok(result.warnings.some((w) => /subtotal \+ tax \+ tip/i.test(w)));
  });
});

describe("insurance / contract validation", () => {
  it("flags expiration before effective", () => {
    const result = validateAnalysis(
      base({
        document_type: "insurance",
        specialist: {
          effective_date: "2026-06-01",
          expiration_date: "2026-01-01",
        },
      })
    );
    assert.ok(result.warnings.some((w) => /expiration/i.test(w)));
  });

  it("flags contract end before start", () => {
    const result = validateAnalysis(
      base({
        document_type: "contract",
        specialist: {
          start_date: "2026-06-01",
          end_date: "2026-01-01",
        },
      })
    );
    assert.ok(result.warnings.some((w) => /end date/i.test(w)));
  });
});

describe("guardian status and deadlines", () => {
  it("does not create alerts from low-confidence analysis", () => {
    const analysis = base({
      overall_confidence: 0.4,
      guardian_status: "needs_verification",
      important_dates: [
        {
          label: "Due date",
          value: "2026-08-01",
          source_type: "document",
          confidence: 0.4,
          source_excerpt: "",
          page_number: null,
          needs_verification: true,
          date: "2026-08-01",
          is_deadline: true,
        },
      ],
    });
    assert.equal(collectDeadlines(analysis, "file.pdf").length, 0);
  });

  it("sets needs_verification for low overall confidence", () => {
    const status = deriveGuardianStatus(base({ overall_confidence: 0.5 }));
    assert.equal(status, "needs_verification");
  });
});

describe("display facts", () => {
  it("separates suggestions from document facts", () => {
    const facts = toDisplayFacts(
      base({
        facts: [
          {
            label: "Total",
            value: "100",
            source_type: "document",
            confidence: 0.95,
            source_excerpt: "Total 100",
            page_number: 1,
            needs_verification: false,
          },
        ],
        suggested_actions: ["Review payment"],
      }),
      "UTC"
    );
    assert.ok(facts.some((f) => f.source === "document" && f.label === "Total"));
    assert.ok(facts.some((f) => f.source === "ai_generated" && f.label === "Suggestion"));
  });

  it("general analysis does not invent specialist invoice fields in display", () => {
    const facts = toDisplayFacts(
      base({
        document_type: "general",
        specialist: { document_purpose: "letter" },
        facts: [
          {
            label: "Subject",
            value: "Hello",
            source_type: "document",
            confidence: 0.9,
            source_excerpt: "",
            page_number: null,
            needs_verification: false,
          },
        ],
      })
    );
    assert.ok(!facts.some((f) => /invoice number/i.test(f.label)));
  });
});
