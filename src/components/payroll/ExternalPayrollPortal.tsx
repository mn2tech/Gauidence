"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import type { ExternalPayrollReportData } from "@/lib/payroll/types";
import { formatPayPeriod } from "@/lib/payroll/compute";
import PayrollVerificationForm from "./PayrollVerificationForm";

type Props = {
  token: string;
};

export default function ExternalPayrollPortal({ token }: Props) {
  const [report, setReport] = useState<ExternalPayrollReportData | null>(null);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/share/${encodeURIComponent(token)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't load report.");
        return;
      }
      if (body.requiresVerification) {
        setRequiresVerification(true);
        setMaskedEmail(body.recipientEmail ?? null);
        return;
      }
      setReport(body.report);
      setRequiresVerification(false);
    } catch {
      setError("Couldn't load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (requiresVerification) {
    return (
      <PayrollVerificationForm
        token={token}
        maskedEmail={maskedEmail}
        onVerified={() => void loadReport()}
      />
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (!report) return null;

  const canDownload = report.accessType === "view_and_download";

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-stone-700 bg-stone-900 p-6">
        <div className="flex items-center gap-2 text-sm text-stone-100">
          <GuardianIcon size={16} tone="dark" alt="" />
          Secure Payroll Report powered by Guardian
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-100">{report.businessName}</h1>
        <p className="mt-1 text-stone-400">
          {formatPayPeriod(report.payPeriodStart, report.payPeriodEnd)}
        </p>
        {report.approvedAt ? (
          <p className="mt-2 text-xs text-stone-500">
            Approved {new Date(report.approvedAt).toLocaleDateString()}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-700">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-stone-700 bg-stone-800/80 text-left text-xs uppercase text-stone-400">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Payroll ID</th>
              <th className="px-4 py-3 text-right">Regular</th>
              <th className="px-4 py-3 text-right">Overtime</th>
              <th className="px-4 py-3 text-right">Adjustments</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((e, i) => (
              <tr key={i} className="border-b border-stone-800 text-stone-200">
                <td className="px-4 py-3">{e.employeeName}</td>
                <td className="px-4 py-3 text-stone-400">{e.payrollEmployeeId ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{e.regularHours}</td>
                <td className="px-4 py-3 text-right tabular-nums">{e.overtimeHours}</td>
                <td className="px-4 py-3 text-right tabular-nums">{e.adjustmentHours}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{e.totalHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs text-stone-500">Regular Hours</p>
          <p className="text-xl font-bold text-stone-100">{report.totals.regularHours}</p>
        </div>
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs text-stone-500">Overtime Hours</p>
          <p className="text-xl font-bold text-amber-400">{report.totals.overtimeHours}</p>
        </div>
        <div className="rounded-xl border border-stone-700 bg-stone-800/50 p-4">
          <p className="text-xs text-stone-500">Total Hours</p>
          <p className="text-xl font-bold text-emerald-400">{report.totals.totalHours}</p>
        </div>
      </div>

      {canDownload && report.allowedFormats.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {report.allowedFormats.map((f) => (
            <a
              key={f}
              href={`/api/payroll/share/${encodeURIComponent(token)}/download?format=${f}`}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Download className="h-4 w-4" />
              Download {f.toUpperCase()}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
