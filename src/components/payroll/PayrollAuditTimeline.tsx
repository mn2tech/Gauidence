"use client";

import type { PayrollShareAccessLog } from "@/lib/payroll/types";

const ACTION_LABELS: Record<string, string> = {
  report_created: "Report created",
  report_approved: "Report approved",
  report_shared: "Report shared",
  email_sent: "Email sent",
  verification_completed: "Verification completed",
  report_opened: "Report opened",
  report_viewed: "Report viewed",
  report_downloaded: "Report downloaded",
  csv_downloaded: "CSV downloaded",
  excel_downloaded: "Excel downloaded",
  pdf_downloaded: "PDF downloaded",
  access_revoked: "Access revoked",
  report_corrected: "Report corrected",
  link_opened: "Link opened",
  code_requested: "Verification code requested",
  verified: "Email verified",
  access_denied: "Access denied",
};

type Props = {
  logs: PayrollShareAccessLog[];
};

export default function PayrollAuditTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-stone-500">No activity recorded yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex gap-4 rounded-xl border border-stone-800 bg-stone-900/50 px-4 py-3"
        >
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-200">
              {ACTION_LABELS[log.action] ?? log.action}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {new Date(log.created_at).toLocaleString()}
              {log.recipient_email ? ` · ${log.recipient_email}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
