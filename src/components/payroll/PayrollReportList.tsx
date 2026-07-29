"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus } from "lucide-react";
import type { PayrollReport } from "@/lib/payroll/types";
import { formatPayPeriod } from "@/lib/payroll/compute";
import PayrollStatusBadge from "@/components/payroll/PayrollStatusBadge";

type Props = {
  profileId: string;
  businessName: string;
  initialReports: PayrollReport[];
};

function defaultPayPeriod(): { start: string; end: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7) - 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 13);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

export default function PayrollReportList({
  profileId,
  businessName,
  initialReports,
}: Props) {
  const [reports, setReports] = useState(initialReports);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaults = defaultPayPeriod();
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          payPeriodStart: periodStart,
          payPeriodEnd: periodEnd,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't generate report.");
      window.location.href = `/payroll/${body.reportId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate report.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-stone-700 bg-stone-900 p-6">
        <h2 className="text-lg font-semibold text-stone-100">
          Generate Payroll Report
        </h2>
        <p className="mt-1 text-sm text-stone-400">
          Select a pay period for {businessName}. Hours are calculated from employee clock-in/out entries.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-500">Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="mt-1 rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500">End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-stone-100"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Generate Draft
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Payroll Reports
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm text-stone-500">No payroll reports yet.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/payroll/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-stone-700 bg-stone-900 px-5 py-4 transition hover:border-stone-600 hover:bg-stone-800/50"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-stone-500" />
                  <div>
                    <p className="font-medium text-stone-100">
                      {formatPayPeriod(r.pay_period_start, r.pay_period_end)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {r.total_hours} total hours · v{r.report_version}
                    </p>
                  </div>
                </div>
                <PayrollStatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
