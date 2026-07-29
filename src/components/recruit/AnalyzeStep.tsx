"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type Props = {
  jobId: string;
  pendingCount: number;
  onComplete: () => void;
  onNext: () => void;
};

export default function AnalyzeStep({
  jobId,
  pendingCount,
  onComplete,
  onNext,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    successCount: number;
    total: number;
  } | null>(null);

  async function handleAnalyze() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        successCount?: number;
        total?: number;
      };
      if (!res.ok) {
        setError(body.error ?? "Analysis failed.");
        return;
      }
      setProgress({
        successCount: body.successCount ?? 0,
        total: body.total ?? 0,
      });
      onComplete();
    } catch {
      setError("Analysis failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Analyze Candidates</h2>
      <p className="text-sm text-ink-muted">
        Run AI analysis on all uploaded resumes. Each candidate will be scored
        against your job requirements and rubric.
      </p>

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-brand" />
        <p className="mt-3 font-medium">
          {pendingCount} candidate{pendingCount === 1 ? "" : "s"} ready for
          analysis
        </p>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={busy || pendingCount === 0}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing… this may take a few minutes
            </>
          ) : (
            "Run analysis"
          )}
        </button>
      </div>

      {progress ? (
        <p className="text-sm text-green-700">
          Analyzed {progress.successCount} of {progress.total} candidates
          successfully.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {progress ? (
        <button
          type="button"
          onClick={onNext}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Continue to review
        </button>
      ) : null}
    </div>
  );
}
