"use client";

import type { PayrollReportData } from "@/lib/payroll/types";
import { formatPayPeriod } from "@/lib/payroll/compute";
import PayrollStatusBadge from "./PayrollStatusBadge";

type Props = {
  data: PayrollReportData;
};

export default function PayrollSummaryCard({ data }: Props) {
  const { report } = data;
  const missingCount = data.entries.filter((e) => e.missing_clock_out).length;

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-100">{data.businessName}</h2>
          <p className="mt-1 text-sm text-stone-400">
            {formatPayPeriod(report.pay_period_start, report.pay_period_end)}
          </p>
        </div>
        <PayrollStatusBadge status={report.status} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Regular Hours
          </p>
          <p className="mt-1 text-2xl font-bold text-stone-100">
            {report.total_regular_hours}
          </p>
        </div>
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Overtime Hours
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-400">
            {report.total_overtime_hours}
          </p>
        </div>
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Total Hours
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">
            {report.total_hours}
          </p>
        </div>
      </div>

      {missingCount > 0 && report.status === "draft" ? (
        <p className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          {missingCount} employee{missingCount === 1 ? "" : "s"} have missing clock-outs
          in this period.
        </p>
      ) : null}

      {report.approved_at ? (
        <p className="mt-4 text-xs text-stone-500">
          Approved {new Date(report.approved_at).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
