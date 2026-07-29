import type { EmployeeHoursSummary } from "./types";
import { formatPayPeriod } from "./compute";

export type PayrollGideonIntent =
  | "prepare_payroll"
  | "missing_clockouts"
  | "employee_hours"
  | "overtime_workers"
  | "approve_report"
  | "share_report"
  | "share_status"
  | "revoke_access"
  | "list_shared"
  | "unknown";

export type PayrollGideonParseResult = {
  intent: PayrollGideonIntent;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  employeeName?: string;
  recipientEmail?: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDateRange(text: string): { start?: string; end?: string } {
  const through = text.match(
    /(\w+)\s+(\d{1,2})\s+through\s+(\w+)\s+(\d{1,2})/i
  );
  if (through) {
    const year = new Date().getFullYear();
    const m1 = MONTHS[through[1].toLowerCase()];
    const m2 = MONTHS[through[3].toLowerCase()];
    if (m1 && m2) {
      const start = `${year}-${String(m1).padStart(2, "0")}-${String(parseInt(through[2])).padStart(2, "0")}`;
      const end = `${year}-${String(m2).padStart(2, "0")}-${String(parseInt(through[4])).padStart(2, "0")}`;
      return { start, end };
    }
  }
  return {};
}

export function parsePayrollGideonQuery(query: string): PayrollGideonParseResult {
  const q = query.trim().toLowerCase();

  if (/prepare payroll|generate payroll|create payroll/.test(q)) {
    const dates = parseDateRange(q);
    return {
      intent: "prepare_payroll",
      payPeriodStart: dates.start,
      payPeriodEnd: dates.end,
      requiresConfirmation: false,
    };
  }

  if (/missing clock.?out/.test(q)) {
    return { intent: "missing_clockouts", requiresConfirmation: false };
  }

  if (/how many.*hours.*work|total hours/.test(q)) {
    const nameMatch = q.match(/(?:did|has)\s+(\w+)\s+work|(\w+)\s+work/i);
    return {
      intent: "employee_hours",
      employeeName: nameMatch?.[1] ?? nameMatch?.[2],
      requiresConfirmation: false,
    };
  }

  if (/overtime|who worked more than/.test(q)) {
    return { intent: "overtime_workers", requiresConfirmation: false };
  }

  if (/share.*payroll|share.*report|share the approved/.test(q)) {
    const emailMatch = q.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const email = emailMatch?.[0]?.replace(/\.$/, "");
    return {
      intent: "share_report",
      recipientEmail: email,
      requiresConfirmation: true,
      confirmationMessage: email
        ? `This report will be shared with ${email}. Confirm sharing?`
        : "Which email should I share the approved payroll report with?",
    };
  }

  if (/did payroll open|open the report|payroll.*open/.test(q)) {
    return { intent: "share_status", requiresConfirmation: false     };
  }

  if (/approve.*payroll|approve this report/.test(q)) {
    return {
      intent: "approve_report",
      requiresConfirmation: true,
      confirmationMessage:
        "I can prepare the approval. Would you like to approve this payroll report? This locks employee hours as a snapshot.",
    };
  }

  if (/revoke.*access|revoke payroll/.test(q)) {
    return {
      intent: "revoke_access",
      requiresConfirmation: true,
      confirmationMessage: "Are you sure you want to revoke payroll access?",
    };
  }

  if (/shared this month|payroll reports shared/.test(q)) {
    return { intent: "list_shared", requiresConfirmation: false };
  }

  return { intent: "unknown", requiresConfirmation: false };
}

export function formatMissingClockouts(entries: EmployeeHoursSummary[]): string {
  const missing = entries.filter((e) => e.missing_clock_out);
  if (missing.length === 0) return "No employees have missing clock-outs in this period.";
  return `Employees with missing clock-outs: ${missing.map((e) => e.employee_name).join(", ")}.`;
}

export function formatOvertimeWorkers(entries: EmployeeHoursSummary[]): string {
  const ot = entries.filter((e) => e.overtime_hours > 0);
  if (ot.length === 0) return "No employees worked overtime in this period.";
  return ot
    .map((e) => `${e.employee_name}: ${e.overtime_hours} overtime hours`)
    .join("\n");
}

export function formatEmployeeHours(
  entries: EmployeeHoursSummary[],
  name?: string
): string {
  if (!name) return "Which employee would you like hours for?";
  const match = entries.find((e) =>
    e.employee_name.toLowerCase().includes(name.toLowerCase())
  );
  if (!match) return `No hours found for ${name} in this period.`;
  return `${match.employee_name} worked ${match.total_hours} hours (${match.regular_hours} regular, ${match.overtime_hours} overtime).`;
}

export function formatApprovalPrompt(
  regularHours: number,
  overtimeHours: number
): string {
  return `Your payroll report contains ${regularHours} regular hours and ${overtimeHours} overtime hours. Would you like to approve it?`;
}

export function formatShareConfirmation(
  email: string,
  expiresInDays: number
): string {
  return `This report will be shared with ${email} and access will expire in ${expiresInDays} days. Confirm sharing?`;
}

export function formatShareStatus(opened: boolean, downloaded: number): string {
  if (!opened) return "Payroll has not opened the report yet.";
  return `Payroll opened the report. Downloads: ${downloaded}.`;
}

export function formatSharedReportsList(
  reports: Array<{ period: string; recipient: string; sharedAt: string }>
): string {
  if (reports.length === 0) return "No payroll reports were shared this month.";
  return reports
    .map((r) => `${r.period} → ${r.recipient} (${new Date(r.sharedAt).toLocaleDateString()})`)
    .join("\n");
}

export { formatPayPeriod };
