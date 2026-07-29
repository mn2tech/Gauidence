"use client";

import { useCallback, useState } from "react";
import { CheckCircle, Loader2, RefreshCw, Share2 } from "lucide-react";
import type { PayrollReportData } from "@/lib/payroll/types";
import PayrollSummaryCard from "./PayrollSummaryCard";
import PayrollEmployeeTable from "./PayrollEmployeeTable";
import ShareWithPayrollModal from "./ShareWithPayrollModal";
import PayrollShareStatusCard from "./PayrollShareStatusCard";
import PayrollAuditTimeline from "./PayrollAuditTimeline";

type Props = {
  initialData: PayrollReportData;
};

export default function PayrollReportBuilder({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [requiresReplace, setRequiresReplace] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reportId = data.report.id;
  const isDraft = data.report.status === "draft";
  const canShare =
    data.report.status === "approved" || data.report.status === "shared";
  const activeShare = data.shares.find(
    (s) => !s.revoked_at && new Date(s.expires_at).getTime() > Date.now()
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/payroll/reports/${reportId}`);
    const body = await res.json();
    if (body.data) setData(body.data);
  }, [reportId]);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/payroll/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't refresh.");
      if (body.data) setData(body.data);
      setMessage("Report refreshed from latest timesheets.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!confirm("Approve this payroll report? Employee hours will be locked as a snapshot.")) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/payroll/reports/${reportId}/approve`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't approve.");
      await reload();
      setMessage("Payroll report approved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't approve.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateEntry(
    entryId: string,
    updates: {
      adjustmentHours?: number;
      adjustmentReason?: string | null;
      ownerNotes?: string | null;
    }
  ) {
    await fetch(`/api/payroll/reports/${reportId}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await reload();
  }

  async function handleShare(args: {
    recipientEmail: string;
    recipientName: string;
    accessType: "view_only" | "view_and_download";
    allowedFormats: ("csv" | "excel" | "pdf")[];
    expiresAt: string;
    requireEmailVerification: boolean;
    optionalMessage: string;
    replaceExisting: boolean;
  }) {
    const res = await fetch(`/api/payroll/reports/${reportId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = await res.json();
    if (res.status === 409) {
      setRequiresReplace(true);
      throw new Error(body.error ?? "Confirm to replace existing share.");
    }
    if (!res.ok) throw new Error(body.error ?? "Couldn't share.");
    if (body.data) setData(body.data);
    setMessage("Secure access sent to payroll company.");
    setRequiresReplace(false);
  }

  async function handleRevoke() {
    if (!activeShare || !confirm("Revoke payroll access?")) return;
    setLoading(true);
    await fetch(`/api/payroll/shares/${activeShare.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    await reload();
    setLoading(false);
    setMessage("Access revoked.");
  }

  async function handleResend() {
    if (!activeShare) return;
    setLoading(true);
    const res = await fetch(`/api/payroll/shares/${activeShare.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend" }),
    });
    const body = await res.json();
    setLoading(false);
    setMessage(res.ok ? "Access email resent." : body.error ?? "Couldn't resend.");
  }

  return (
    <div className="space-y-8">
      <PayrollSummaryCard data={data} />

      {message ? (
        <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
          {message}
        </p>
      ) : null}

      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Employee Hours
        </h3>
        <PayrollEmployeeTable
          entries={data.entries}
          editable={isDraft}
          onUpdateEntry={isDraft ? handleUpdateEntry : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {isDraft ? (
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-600 px-5 py-3 text-sm font-medium text-stone-200 hover:bg-stone-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh from Timesheets
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Approve Report
            </button>
          </>
        ) : null}

        {canShare ? (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            Share with Payroll
          </button>
        ) : null}
      </div>

      {activeShare ? (
        <PayrollShareStatusCard
          share={activeShare}
          onRevoke={handleRevoke}
          onResend={handleResend}
          loading={loading}
        />
      ) : null}

      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Activity
        </h3>
        <PayrollAuditTimeline logs={data.auditLogs} />
      </div>

      <ShareWithPayrollModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShare={handleShare}
        requiresReplace={requiresReplace}
      />
    </div>
  );
}
