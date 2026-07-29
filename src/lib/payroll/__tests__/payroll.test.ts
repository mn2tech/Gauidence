import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEmployeeHours,
  hoursBetween,
  roundHours,
  sumReportTotals,
} from "../compute";
import {
  parsePayrollGideonQuery,
  formatApprovalPrompt,
  formatMissingClockouts,
} from "../ai";
import {
  createAccessToken,
  hashAccessToken,
  hashVerificationCode,
  tokensMatch,
} from "../tokens";
import { maskPayrollEmployeeId } from "../types";

describe("payroll compute", () => {
  it("calculates hours between timestamps", () => {
    assert.equal(hoursBetween("2026-07-01T09:00:00.000Z", "2026-07-01T17:00:00.000Z"), 8);
  });

  it("rounds hours to 2 decimals", () => {
    assert.equal(roundHours(8.333333), 8.33);
  });

  it("computes employee hours with overtime", () => {
    const entries = [
      {
        employee_profile_id: "e1",
        employee_name: "Sarah",
        payroll_employee_id: "EMP001",
        clock_in_at: "2026-07-01T09:00:00.000Z",
        clock_out_at: "2026-07-01T19:00:00.000Z",
      },
      {
        employee_profile_id: "e1",
        employee_name: "Sarah",
        payroll_employee_id: "EMP001",
        clock_in_at: "2026-07-02T09:00:00.000Z",
        clock_out_at: "2026-07-02T19:00:00.000Z",
      },
    ];
    const result = computeEmployeeHours(entries, "2026-07-01", "2026-07-07");
    assert.equal(result.length, 1);
    assert.equal(result[0].total_hours, 20);
    assert.equal(result[0].regular_hours, 20);
    assert.equal(result[0].overtime_hours, 0);
  });

  it("includes manual daily hours", () => {
    const entries = [
      {
        employee_profile_id: "e1",
        employee_name: "Alex",
        payroll_employee_id: null,
        entry_type: "manual" as const,
        work_date: "2026-07-01",
        manual_hours: 7.5,
        clock_in_at: null,
        clock_out_at: null,
      },
    ];
    const result = computeEmployeeHours(entries, "2026-07-01", "2026-07-07");
    assert.equal(result[0].total_hours, 7.5);
  });

  it("flags missing clock-outs", () => {
    const entries = [
      {
        employee_profile_id: "e1",
        employee_name: "Mike",
        payroll_employee_id: null,
        clock_in_at: "2026-07-01T09:00:00.000Z",
        clock_out_at: null,
      },
    ];
    const result = computeEmployeeHours(entries, "2026-07-01", "2026-07-07");
    assert.equal(result[0].missing_clock_out, true);
    assert.equal(result[0].total_hours, 0);
  });

  it("sums report totals with adjustments", () => {
    const totals = sumReportTotals([
      { regular_hours: 40, overtime_hours: 4, total_hours: 44, adjustment_hours: 0.5 },
      { regular_hours: 32, overtime_hours: 0, total_hours: 32, adjustment_hours: 0 },
    ]);
    assert.equal(totals.total_regular_hours, 72);
    assert.equal(totals.total_overtime_hours, 4);
    assert.equal(totals.total_hours, 76.5);
  });
});

describe("payroll tokens", () => {
  it("hashes access tokens consistently", () => {
    const token = createAccessToken();
    assert.equal(hashAccessToken(token), hashAccessToken(token));
    assert.notEqual(hashAccessToken(token), hashAccessToken(token + "x"));
  });

  it("matches tokens with timing-safe comparison", () => {
    const code = "123456";
    const hash = hashVerificationCode(code);
    assert.equal(tokensMatch(hash, code, hashVerificationCode), true);
    assert.equal(tokensMatch(hash, "654321", hashVerificationCode), false);
  });
});

describe("payroll gideon", () => {
  it("parses prepare payroll intent with date range", () => {
    const result = parsePayrollGideonQuery("Prepare payroll for July 13 through July 26.");
    assert.equal(result.intent, "prepare_payroll");
    assert.ok(result.payPeriodStart?.includes("07-13"));
    assert.ok(result.payPeriodEnd?.includes("07-26"));
  });

  it("requires confirmation for clock in unless confirmed", () => {
    const ask = parsePayrollGideonQuery("Clock me in");
    assert.equal(ask.intent, "clock_in");
    assert.equal(ask.requiresConfirmation, true);

    const confirmed = parsePayrollGideonQuery("Yes, clock me in");
    assert.equal(confirmed.intent, "clock_in");
    assert.equal(confirmed.requiresConfirmation, false);
    assert.equal(confirmed.confirmed, true);
  });

  it("parses clock out for named employee", () => {
    const result = parsePayrollGideonQuery("Yes, clock out Daniel");
    assert.equal(result.intent, "clock_out");
    assert.equal(result.employeeName, "Daniel");
    assert.equal(result.confirmed, true);
  });

  it("requires confirmation for approve and share", () => {
    const approve = parsePayrollGideonQuery("Approve this payroll report.");
    assert.equal(approve.intent, "approve_report");
    assert.equal(approve.requiresConfirmation, true);

    const share = parsePayrollGideonQuery(
      "Share the approved payroll report with payroll@example.com."
    );
    assert.equal(share.intent, "share_report");
    assert.equal(share.requiresConfirmation, true);
    assert.equal(share.recipientEmail, "payroll@example.com");
  });

  it("formats approval prompt", () => {
    const msg = formatApprovalPrompt(118.5, 4);
    assert.match(msg, /118\.5 regular/);
    assert.match(msg, /4 overtime/);
  });

  it("formats missing clock-out warnings", () => {
    const msg = formatMissingClockouts([
      {
        employee_profile_id: "e1",
        employee_name: "Sarah",
        payroll_employee_id: null,
        regular_hours: 0,
        overtime_hours: 0,
        total_hours: 0,
        adjustment_hours: 0,
        adjustment_reason: null,
        owner_notes: null,
        missing_clock_out: true,
        time_entry_count: 1,
      },
    ]);
    assert.match(msg, /Sarah/);
  });
});

describe("payroll external display", () => {
  it("masks payroll employee IDs", () => {
    assert.equal(maskPayrollEmployeeId("EMP12345"), "****2345");
    assert.equal(maskPayrollEmployeeId(null), null);
  });
});
