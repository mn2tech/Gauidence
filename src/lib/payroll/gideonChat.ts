import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parsePayrollGideonQuery,
  formatMissingClockouts,
  formatOvertimeWorkers,
  formatEmployeeHours,
  formatApprovalPrompt,
  formatShareStatus,
  type PayrollGideonIntent,
} from "./ai";
import { buildDraftFromTimesheets } from "./reportData";
import {
  executeClockIn,
  executeClockOut,
  findEmployeeProfileId,
} from "./clockActions";
import {
  getActiveShare,
  getPayrollReport,
  listPayrollReports,
} from "./server";
import { formatPayPeriod } from "./compute";

const PAYROLL_KEYWORDS =
  /\b(payroll|timesheet|clock.?out|clock.?in|punch.?in|punch.?out|overtime|pay period|share.*report|approve.*report|start.*shift|end.*shift)\b/i;

export function wantsPayrollQuery(question: string): boolean {
  const parsed = parsePayrollGideonQuery(question);
  if (parsed.intent !== "unknown") return true;
  return PAYROLL_KEYWORDS.test(question);
}

export type PayrollGideonAnswer = {
  message: string;
  requiresConfirmation?: boolean;
  intent?: PayrollGideonIntent;
  href?: string;
};

export async function answerPayrollGideonQuery(
  supabase: SupabaseClient,
  args: {
    query: string;
    profileId: string;
    employeeProfileId?: string;
    userId?: string;
    reportId?: string;
    confirmed?: boolean;
  }
): Promise<PayrollGideonAnswer | null> {
  const parsed = parsePayrollGideonQuery(args.query);
  if (parsed.intent === "unknown" && !PAYROLL_KEYWORDS.test(args.query)) {
    return null;
  }

  const isConfirmed = args.confirmed || parsed.confirmed;

  if (
    (parsed.intent === "clock_in" || parsed.intent === "clock_out") &&
    !isConfirmed
  ) {
    return {
      message:
        parsed.confirmationMessage ??
        "Reply with confirmation to clock in or out.",
      requiresConfirmation: true,
      intent: parsed.intent,
      href: args.employeeProfileId ? "/employee" : undefined,
    };
  }

  if (
    (parsed.intent === "clock_in" || parsed.intent === "clock_out") &&
    isConfirmed &&
    args.userId
  ) {
    let targetEmployeeId = args.employeeProfileId;
    let targetName = "You";

    if (parsed.employeeName) {
      const found = await findEmployeeProfileId(
        supabase,
        args.profileId,
        parsed.employeeName
      );
      if (!found) {
        return {
          message: `I couldn't find an employee named "${parsed.employeeName}".`,
          href: "/employee",
        };
      }
      targetEmployeeId = found.id;
      targetName = found.display_name;
    }

    if (!targetEmployeeId) {
      return {
        message: "Which employee should I clock in or out?",
        href: "/employee",
      };
    }

    const result =
      parsed.intent === "clock_in"
        ? await executeClockIn(
            supabase,
            args.profileId,
            targetEmployeeId,
            args.userId
          )
        : await executeClockOut(supabase, args.profileId, targetEmployeeId);

    const prefix = targetName === "You" ? "" : `${targetName}: `;
    return {
      message: `${prefix}${result.message}`,
      intent: parsed.intent,
      href: "/employee",
    };
  }

  if (
    (parsed.intent === "approve_report" ||
      parsed.intent === "share_report" ||
      parsed.intent === "revoke_access") &&
    !args.confirmed
  ) {
    if (parsed.intent === "approve_report") {
      const reports = await listPayrollReports(supabase, args.profileId);
      const draft = reports.find((r) => r.status === "draft");
      if (draft) {
        return {
          message: formatApprovalPrompt(
            draft.total_regular_hours,
            draft.total_overtime_hours
          ),
          requiresConfirmation: true,
          intent: parsed.intent,
          href: `/payroll/${draft.id}`,
        };
      }
    }
    return {
      message:
        parsed.confirmationMessage ??
        "Please confirm this action in the Payroll section.",
      requiresConfirmation: true,
      intent: parsed.intent,
      href: "/payroll",
    };
  }

  const reports = await listPayrollReports(supabase, args.profileId);
  const latestDraft = reports.find((r) => r.status === "draft");
  const latestApproved = reports.find(
    (r) => r.status === "approved" || r.status === "shared"
  );

  switch (parsed.intent) {
    case "prepare_payroll": {
      if (!parsed.payPeriodStart || !parsed.payPeriodEnd) {
        return {
          message:
            "Which pay period should I prepare? For example: July 13 through July 26. Open Payroll to generate a draft when ready.",
          href: "/payroll",
        };
      }
      return {
        message: `I can prepare a payroll draft for ${formatPayPeriod(parsed.payPeriodStart, parsed.payPeriodEnd)}. Open Payroll to generate the report.`,
        href: "/payroll",
      };
    }

    case "missing_clockouts": {
      const report =
        (args.reportId
          ? await getPayrollReport(supabase, args.reportId)
          : null) ?? latestDraft ?? latestApproved;
      if (!report) {
        return { message: "No payroll report found for this period. Open Payroll to create one." };
      }
      const summaries = await buildDraftFromTimesheets(
        supabase,
        report.profile_id,
        report.pay_period_start,
        report.pay_period_end
      );
      return { message: formatMissingClockouts(summaries) };
    }

    case "employee_hours": {
      const report =
        (args.reportId
          ? await getPayrollReport(supabase, args.reportId)
          : null) ?? latestDraft ?? latestApproved;
      if (!report) {
        return { message: "No payroll report found." };
      }
      const summaries = await buildDraftFromTimesheets(
        supabase,
        report.profile_id,
        report.pay_period_start,
        report.pay_period_end
      );
      return { message: formatEmployeeHours(summaries, parsed.employeeName) };
    }

    case "overtime_workers": {
      const report = latestDraft ?? latestApproved;
      if (!report) {
        return { message: "No payroll report found." };
      }
      const summaries = await buildDraftFromTimesheets(
        supabase,
        report.profile_id,
        report.pay_period_start,
        report.pay_period_end
      );
      return { message: formatOvertimeWorkers(summaries) };
    }

    case "approve_report": {
      if (!latestDraft) {
        return { message: "No draft payroll report to approve." };
      }
      return {
        message:
          "Open the payroll report to review and approve. I cannot approve payroll silently — you must confirm on the report page.",
        href: `/payroll/${latestDraft.id}`,
      };
    }

    case "share_report": {
      const report =
        latestApproved ?? reports.find((r) => r.status === "shared");
      if (!report || report.status === "draft") {
        return {
          message: "Approve a payroll report before sharing with your payroll company.",
          href: "/payroll",
        };
      }
      return {
        message: parsed.recipientEmail
          ? `Open the report to share with ${parsed.recipientEmail}. Sharing requires your confirmation on the report page.`
          : "Open the payroll report to configure secure sharing.",
        href: `/payroll/${report.id}`,
      };
    }

    case "share_status": {
      const report = reports.find((r) => r.status === "shared");
      if (!report) {
        return { message: "No shared payroll report found." };
      }
      const share = await getActiveShare(supabase, report.id);
      if (!share) {
        return { message: "No active payroll share found." };
      }
      return {
        message: formatShareStatus(Boolean(share.opened_at), share.download_count),
      };
    }

    case "revoke_access": {
      return {
        message: "Open the payroll report to revoke external access.",
        href: latestApproved ? `/payroll/${latestApproved.id}` : "/payroll",
      };
    }

    case "list_shared": {
      const shared = reports.filter((r) => r.status === "shared");
      if (shared.length === 0) {
        return { message: "No payroll reports have been shared recently." };
      }
      const lines = shared.map((r) =>
        formatPayPeriod(r.pay_period_start, r.pay_period_end)
      );
      return { message: `Shared payroll reports: ${lines.join(", ")}.` };
    }

    default:
      return {
        message:
          "I can help with payroll — preparing reports, missing clock-outs, overtime, approval, and sharing. Try asking from a business vault or open Payroll.",
        href: "/payroll",
      };
  }
}
