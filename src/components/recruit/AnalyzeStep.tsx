"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Loader2, Sparkles, XCircle } from "lucide-react";
import type { CandidateWithDetails } from "@/lib/recruit/types";

type Props = {
  jobId: string;
  candidates: CandidateWithDetails[];
  onComplete: () => void;
  onNext: () => void;
};

type CandidateResult = {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  error?: string;
};

const PER_CANDIDATE_TIMEOUT_MS = 280_000;

function needsAnalysis(c: CandidateWithDetails): boolean {
  return (
    c.processing_status === "pending" ||
    c.processing_status === "extracted" ||
    c.processing_status === "failed" ||
    c.processing_status === "extracting" ||
    c.processing_status === "analyzing"
  );
}

function candidateLabel(c: CandidateWithDetails): string {
  return (
    c.display_name ??
    c.files[0]?.file_name?.replace(/\.[^.]+$/, "") ??
    "Candidate"
  );
}

export default function AnalyzeStep({
  jobId,
  candidates,
  onComplete,
  onNext,
}: Props) {
  const pendingCandidates = useMemo(
    () => candidates.filter(needsAnalysis),
    [candidates]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [finished, setFinished] = useState(false);

  const successCount = results.filter((r) => r.status === "success").length;
  const total = pendingCandidates.length;
  const progressPct =
    total > 0 ? Math.round((results.length / total) * 100) : 0;

  async function analyzeOne(candidate: CandidateWithDetails): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      PER_CANDIDATE_TIMEOUT_MS
    );

    try {
      const res = await fetch(
        `/api/recruit/jobs/${jobId}/candidates/${candidate.id}/analyze`,
        {
          method: "POST",
          signal: controller.signal,
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      return res.ok && body.ok === true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function handleAnalyze() {
    if (pendingCandidates.length === 0) return;
    setBusy(true);
    setError(null);
    setFinished(false);
    setCurrentIndex(0);

    const initial: CandidateResult[] = pendingCandidates.map((c) => ({
      id: c.id,
      name: candidateLabel(c),
      status: "pending",
    }));
    setResults(initial);

    const outcome = [...initial];

    for (let i = 0; i < pendingCandidates.length; i++) {
      const candidate = pendingCandidates[i]!;
      setCurrentIndex(i);
      outcome[i] = { ...outcome[i]!, status: "running" };
      setResults([...outcome]);

      const ok = await analyzeOne(candidate);
      outcome[i] = {
        ...outcome[i]!,
        status: ok ? "success" : "failed",
        error: ok ? undefined : "Analysis failed or timed out.",
      };
      setResults([...outcome]);
      onComplete();
    }

    const succeeded = outcome.filter((r) => r.status === "success").length;
    setFinished(true);
    setBusy(false);

    if (succeeded === 0) {
      setError("No candidates were analyzed successfully. Try again.");
    }

    await fetch(`/api/recruit/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_step: "review", status: "reviewing" }),
    });
  }

  const alreadyAnalyzed = candidates.filter(
    (c) => c.processing_status === "analyzed"
  ).length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Analyze Candidates</h2>
      <p className="text-sm text-ink-muted">
        Each resume is analyzed one at a time to avoid timeouts. Expect about
        1–2 minutes per candidate.
      </p>

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
        <div className="text-center">
          <Sparkles className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-3 font-medium">
            {pendingCandidates.length > 0
              ? `${pendingCandidates.length} candidate${pendingCandidates.length === 1 ? "" : "s"} ready for analysis`
              : `${alreadyAnalyzed} candidate${alreadyAnalyzed === 1 ? "" : "s"} already analyzed`}
          </p>
          {alreadyAnalyzed > 0 && pendingCandidates.length > 0 ? (
            <p className="mt-1 text-sm text-ink-muted">
              {alreadyAnalyzed} already completed — only pending resumes will be
              processed.
            </p>
          ) : null}
        </div>

        {busy ? (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs text-ink-muted">
              <span>
                {currentIndex + 1} of {total}
                {results[currentIndex]
                  ? ` — ${results[currentIndex]!.name}`
                  : ""}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing… usually 1–2 minutes per resume
            </p>
          </div>
        ) : (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={pendingCandidates.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {pendingCandidates.length === 0 ? "All analyzed" : "Run analysis"}
            </button>
          </div>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              {r.status === "running" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
              ) : r.status === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
              ) : r.status === "failed" ? (
                <XCircle className="h-4 w-4 shrink-0 text-red-500" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-stone-300" />
              )}
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              {r.error ? (
                <span className="text-xs text-red-600">{r.error}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {finished ? (
        <p className="text-sm text-green-700">
          Finished: {successCount} of {total} analyzed successfully.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {finished || (alreadyAnalyzed > 0 && pendingCandidates.length === 0) ? (
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
