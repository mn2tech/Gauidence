"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Mail, Send } from "lucide-react";

type Props = {
  jobId: string;
  jobTitle: string;
  hiringManagerName?: string | null;
  hiringManagerEmail?: string | null;
};

export default function ExportStep({
  jobId,
  jobTitle,
  hiringManagerName,
  hiringManagerEmail,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [inAppUrl, setInAppUrl] = useState<string | null>(null);
  const [email, setEmail] = useState(hiringManagerEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  async function generateReport() {
    setBusy(true);
    setError(null);
    setSendSuccess(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/report`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailDraft?: string;
        reportUrl?: string;
        exportUrls?: { inApp?: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't generate report.");
        return;
      }
      setEmailDraft(body.emailDraft ?? null);
      setReportUrl(body.reportUrl ?? null);
      setInAppUrl(body.exportUrls?.inApp ?? `/recruit/${jobId}/report`);
    } catch {
      setError("Couldn't generate report.");
    } finally {
      setBusy(false);
    }
  }

  async function sendToHiringManager() {
    if (!email.trim()) {
      setError("Enter the hiring manager's email address.");
      return;
    }
    setSending(true);
    setError(null);
    setSendSuccess(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/report/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sentTo?: string;
        reportUrl?: string;
        authenticatedUrl?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't send report email.");
        if (body.reportUrl) setReportUrl(body.reportUrl);
        return;
      }
      setSendSuccess(`Report emailed to ${body.sentTo}. Link expires in 30 days.`);
      if (body.reportUrl) setReportUrl(body.reportUrl);
      if (body.authenticatedUrl) setInAppUrl(body.authenticatedUrl);
    } catch {
      setError("Couldn't send report email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Export Report</h2>
      <p className="text-sm text-ink-muted">
        Generate a shortlist report, email the hiring manager a secure
        in-Guardian link, or download files.
      </p>

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h3 className="font-medium">Email hiring manager</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Sends a secure link to view the report inside Guardian
          {hiringManagerName ? ` (${hiringManagerName})` : ""}. No attachments.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hiring.manager@company.com"
            className="min-w-[240px] flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void sendToHiringManager()}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send report link
          </button>
        </div>
        {sendSuccess ? (
          <p className="mt-3 text-sm text-green-700">{sendSuccess}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void generateReport()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Generate report preview
      </button>

      {inAppUrl ? (
        <Link
          href={inAppUrl}
          className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Open in-app report
        </Link>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/recruit/jobs/${jobId}/report?format=csv`}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
        <a
          href={`/api/recruit/jobs/${jobId}/report?format=html`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          <Download className="h-4 w-4" />
          Export PDF (print)
        </a>
        <a
          href={`/api/recruit/jobs/${jobId}/report?format=docx`}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          <Download className="h-4 w-4" />
          Export DOCX
        </a>
      </div>

      {emailDraft ? (
        <div className="rounded-xl border border-stone-200 p-4">
          <div className="flex items-center gap-2 font-medium">
            <Mail className="h-4 w-4" />
            Email draft (manual copy)
          </div>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">
            {emailDraft}
          </pre>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(emailDraft)}
            className="mt-3 text-sm text-brand hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      ) : null}

      {reportUrl ? (
        <p className="text-xs text-ink-muted">
          Secure share link (for your records): {reportUrl}
        </p>
      ) : null}
    </div>
  );
}
