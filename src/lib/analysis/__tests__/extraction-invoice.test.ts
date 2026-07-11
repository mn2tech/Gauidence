import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessExtractionQuality,
  scoreExtractionQuality,
} from "../extract-quality.ts";
import { parseInvoiceFromText } from "../invoiceText.ts";
import { sanitizeInvoiceNumber } from "../invoiceSanitize.ts";
import { validateAnalysis } from "../validate.ts";
import { toDisplayFacts } from "../display.ts";
import type { GuardianAnalysis } from "../types.ts";
import {
  NM2TECH_INVOICE_EXPECTED,
  NM2TECH_INVOICE_FIXTURE_TEXT,
} from "./fixtures/nm2tech-invoice.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "fixtures", "onyx-invoice16.pdf");

describe("NM2TECH regression PDF — native text layer", () => {
  it("has no usable native text layer (Print-to-PDF / image)", async () => {
    const { getDocumentProxy } = await import("unpdf");
    const bytes = new Uint8Array(readFileSync(PDF_PATH));
    const pdf = await getDocumentProxy(bytes);
    assert.ok(pdf.numPages >= 1);

    let itemCount = 0;
    let nativeChars = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const it of content.items) {
        const str = typeof it === "object" && it && "str" in it ? String((it as { str: string }).str) : "";
        if (str.trim()) {
          itemCount += 1;
          nativeChars += str.length;
        }
      }
    }

    assert.equal(itemCount, 0, "expected zero text-layer items");
    assert.ok(nativeChars < 10, `expected empty native text, got chars=${nativeChars}`);
    assert.ok(scoreExtractionQuality("") < 0.45);

    // Page rasterization for OCR is verified separately in extract.ts via @napi-rs/canvas.
    // Avoid combining pdf.js worker ops that crash under node:test structuredClone.
  });
});

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

  it("flags incomplete line items in short corrupted text", () => {
    const report = assessExtractionQuality(
      "Invoice #0000016\nSubtotal: $1,628.00\nTotal Due: $1,628.00\nFrank 177 100 1700"
    );
    assert.ok(report.score < 0.7);
  });
});

describe("deterministic invoice text parser (post-OCR)", () => {
  it("extracts all NM2TECH regression fields from fixture text", () => {
    const parsed = parseInvoiceFromText(NM2TECH_INVOICE_FIXTURE_TEXT);
    assert.equal(parsed.invoice_number, NM2TECH_INVOICE_EXPECTED.invoice_number);
    assert.equal(parsed.invoice_date, NM2TECH_INVOICE_EXPECTED.invoice_date);
    assert.equal(parsed.due_date, NM2TECH_INVOICE_EXPECTED.due_date);
    assert.equal(parsed.explicit_due_date, true);
    assert.match(parsed.issuer ?? "", /NM2TECH/i);
    assert.match(parsed.billed_to ?? "", /Onyx Government Services/i);
    assert.equal(parsed.subtotal, NM2TECH_INVOICE_EXPECTED.subtotal);
    assert.equal(parsed.total_amount_due, NM2TECH_INVOICE_EXPECTED.total_amount_due);
    assert.equal(parsed.line_items.length, 4);

    for (const expected of NM2TECH_INVOICE_EXPECTED.lines) {
      const row = parsed.line_items.find((l) =>
        l.contractor.toLowerCase().includes(expected.contractor.split(" ")[0]!.toLowerCase())
      );
      assert.ok(row, `missing ${expected.contractor}`);
      assert.equal(row!.hours, expected.hours);
      assert.equal(row!.rate, expected.rate);
      assert.equal(row!.amount, expected.amount);
      assert.equal(expected.hours * expected.rate, expected.amount);
    }
  });

  it("does not invent a due date when only invoice date is present", () => {
    const parsed = parseInvoiceFromText(
      "Invoice #: #0000016\nDate: 2026-07-07\nSubtotal: 100\nTotal Due: 100"
    );
    assert.equal(parsed.invoice_date, "2026-07-07");
    assert.equal(parsed.due_date, null);
    assert.equal(parsed.explicit_due_date, false);
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
        __extraction_estimated_line_rows: 4,
        line_items: [
          {
            contractor: "Daniel Tata",
            hours: 168,
            rate: 96,
            amount: 1628,
            confidence: 0.9,
          },
          {
            contractor: "Frank Damico",
            hours: 177,
            rate: 100,
            amount: 17700,
            confidence: 0.9,
          },
        ],
      },
    };

    const validated = validateAnalysis(corrupted);
    assert.ok(
      validated.warnings.some((w) => /Daniel Tata/i.test(w) && /16128/.test(w))
    );
    assert.ok(
      validated.warnings.some((w) =>
        /line items may not have been extracted completely/i.test(w)
      )
    );
    assert.equal(validated.specialist.total_amount_due_needs_verification, true);

    const facts = toDisplayFacts(validated, "UTC");
    const danielCalc = facts.find(
      (f) => f.source === "calculated" && /Daniel Tata/i.test(f.label)
    );
    assert.ok(danielCalc);
    assert.match(danielCalc!.value, /16,?128/);
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
        __extraction_estimated_line_rows: 4,
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
    assert.ok(
      !validated.warnings.some((w) => /needs verification \(document/.test(w))
    );
    assert.ok(
      !validated.warnings.some((w) =>
        /line items may not have been extracted completely/i.test(w)
      )
    );
  });
});
