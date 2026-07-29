"use client";

import { useState } from "react";
import { Download, Loader2, Mail } from "lucide-react";

type Props = {
  jobId: string;
  jobTitle: string;
};

export default function ExportStep({ jobId, jobTitle }: Props) {
  const [busy, setBusy] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/report`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailDraft?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't generate report.");
        return;
      }
      setEmailDraft(body.emailDraft ?? null);
    } catch {
      setError("Couldn't generate report.");
    } finally {
      setBusy(false);
    }
  }

  const safeTitle = jobTitle.replace(/[^\w]/g, "-");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Export Report</h2>
      <p className="text-sm text-ink-muted">
        Generate a hiring manager report and export in your preferred format.
      </p>

      <button
        type="button"
        onClick={() => void generateReport()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Generate report
      </button>

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
            Email draft for hiring manager
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
    </div>
  );
}
