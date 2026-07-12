/**
 * Accuracy scoring for dual-analyzer comparisons.
 * Expected values belong in test fixtures only — never hardcode into production analyzers.
 */

import type { GuardianAnalysis } from "../types";

export type ExpectedInvoiceLine = {
  contractor: string;
  hours: number;
  rate: number;
  amount: number;
};

export type ExpectedInvoice = {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  issuer: string;
  billed_to: string;
  lines: readonly ExpectedInvoiceLine[];
  subtotal: number;
  total_amount_due: number;
};

export type FieldScore = {
  field: string;
  expected: string;
  actual: string;
  ok: boolean;
};

export type AccuracyReport = {
  arm: string;
  checks: FieldScore[];
  matched: number;
  total: number;
  pct: number;
  validationWarnings: string[];
  mathOk: boolean;
};

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function moneyEq(a: unknown, b: number): boolean {
  const n =
    typeof a === "number"
      ? a
      : typeof a === "string"
        ? Number(a.replace(/[,$]/g, ""))
        : NaN;
  return Number.isFinite(n) && Math.abs(n - b) <= 0.02;
}

function strEq(a: unknown, b: string): boolean {
  return String(a ?? "").trim() === b.trim();
}

/**
 * Score specialist fields against a fixture expected invoice after validation.
 */
export function scoreInvoiceAccuracy(
  arm: string,
  analysis: GuardianAnalysis,
  expected: ExpectedInvoice
): AccuracyReport {
  const s = analysis.specialist ?? {};
  const checks: FieldScore[] = [];

  const push = (field: string, expectedVal: string, actual: unknown, ok: boolean) => {
    checks.push({
      field,
      expected: expectedVal,
      actual: actual == null ? "" : String(actual),
      ok,
    });
  };

  push(
    "invoice_number",
    expected.invoice_number,
    s.invoice_number,
    strEq(s.invoice_number, expected.invoice_number)
  );
  push(
    "invoice_date",
    expected.invoice_date,
    s.invoice_date,
    strEq(s.invoice_date, expected.invoice_date)
  );
  push("due_date", expected.due_date, s.due_date, strEq(s.due_date, expected.due_date));
  push(
    "issuer",
    expected.issuer,
    s.issuer,
    normName(String(s.issuer ?? "")) === normName(expected.issuer)
  );
  push(
    "billed_to",
    expected.billed_to,
    s.billed_to,
    normName(String(s.billed_to ?? "")) === normName(expected.billed_to)
  );
  push(
    "subtotal",
    String(expected.subtotal),
    s.subtotal,
    moneyEq(s.subtotal, expected.subtotal)
  );
  push(
    "total_amount_due",
    String(expected.total_amount_due),
    s.total_amount_due,
    moneyEq(s.total_amount_due, expected.total_amount_due)
  );

  const lines = Array.isArray(s.line_items)
    ? (s.line_items as Record<string, unknown>[])
    : [];
  push(
    "line_count",
    String(expected.lines.length),
    lines.length,
    lines.length === expected.lines.length
  );

  for (const exp of expected.lines) {
    const hit = lines.find(
      (row) => normName(String(row.contractor ?? "")) === normName(exp.contractor)
    );
    push(
      `line:${exp.contractor}:hours`,
      String(exp.hours),
      hit?.hours ?? hit?.quantity,
      hit != null && moneyEq(hit.hours ?? hit.quantity, exp.hours)
    );
    push(
      `line:${exp.contractor}:rate`,
      String(exp.rate),
      hit?.rate ?? hit?.unit_rate,
      hit != null && moneyEq(hit.rate ?? hit.unit_rate, exp.rate)
    );
    push(
      `line:${exp.contractor}:amount`,
      String(exp.amount),
      hit?.amount ?? hit?.line_total,
      hit != null && moneyEq(hit.amount ?? hit.line_total, exp.amount)
    );
  }

  const matched = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const validationWarnings = analysis.warnings ?? [];
  const mathOk = !validationWarnings.some((w) =>
    /hours\s*[×x]|line total|subtotal|amount due|missing digit|math/i.test(w)
  );

  return {
    arm,
    checks,
    matched,
    total,
    pct: total === 0 ? 0 : Math.round((matched / total) * 1000) / 10,
    validationWarnings,
    mathOk,
  };
}

export function formatAccuracyTable(reports: AccuracyReport[]): string {
  const lines: string[] = [];
  lines.push("Arm".padEnd(22) + "Match".padEnd(12) + "Math".padEnd(8) + "Warnings");
  lines.push("-".repeat(70));
  for (const r of reports) {
    lines.push(
      r.arm.padEnd(22) +
        `${r.matched}/${r.total} (${r.pct}%)`.padEnd(12) +
        (r.mathOk ? "ok" : "FAIL").padEnd(8) +
        String(r.validationWarnings.length)
    );
  }
  lines.push("");
  for (const r of reports) {
    lines.push(`--- ${r.arm} field diffs ---`);
    for (const c of r.checks.filter((x) => !x.ok)) {
      lines.push(`  ✗ ${c.field}: expected=${c.expected} actual=${c.actual}`);
    }
    const okCount = r.checks.filter((x) => x.ok).length;
    if (okCount === r.checks.length) lines.push("  (all fields matched)");
    if (r.validationWarnings.length) {
      for (const w of r.validationWarnings) lines.push(`  ! ${w}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
