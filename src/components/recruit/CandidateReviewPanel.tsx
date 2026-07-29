"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RECOMMENDATION_LABELS, type CandidateWithDetails } from "@/lib/recruit/types";
import RecruitSafetyNotice from "./RecruitSafetyNotice";

type Props = {
  jobId: string;
  candidate: CandidateWithDetails;
  onClose: () => void;
  onUpdated: () => void;
};

export default function CandidateReviewPanel({
  jobId,
  candidate,
  onClose,
  onUpdated,
}: Props) {
  const [notes, setNotes] = useState(candidate.review?.recruiter_notes ?? "");
  const [summary, setSummary] = useState(
    candidate.review?.edited_summary ?? candidate.score?.candidate_summary ?? ""
  );
  const [overrideScore, setOverrideScore] = useState(
    candidate.score?.overridden_score?.toString() ??
      candidate.score?.match_score?.toString() ??
      ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  useEffect(() => {
    const file = candidate.files[0];
    if (!file) return;
    const supabase = createClient();
    if (!supabase) return;
    void supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.file_path, 600)
      .then(({ data }) => {
        if (data?.signedUrl) setResumeUrl(data.signedUrl);
      });
  }, [candidate.files]);

  async function saveReview(reviewStatus?: string) {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        recruiter_notes: notes,
        edited_summary: summary,
      };
      if (overrideScore) {
        body.overridden_score = parseFloat(overrideScore);
      }
      if (reviewStatus) body.review_status = reviewStatus;

      const res = await fetch(
        `/api/recruit/jobs/${jobId}/candidates/${candidate.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save review.");
        return;
      }
      onUpdated();
      if (reviewStatus) onClose();
    } catch {
      setError("Couldn't save review.");
    } finally {
      setBusy(false);
    }
  }

  const score = candidate.score;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <h2 className="font-semibold">
            {candidate.display_name ?? "Candidate Review"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 p-5">
          <RecruitSafetyNotice />

          {resumeUrl ? (
            <a
              href={resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Open original resume
            </a>
          ) : null}

          {score ? (
            <div className="rounded-xl border border-stone-200 p-4">
              <p className="text-sm">
                <strong>AI Score:</strong> {score.match_score}
                {score.overridden_score != null ? (
                  <span className="ml-2 text-brand">
                    (Overridden: {score.overridden_score})
                  </span>
                ) : null}
              </p>
              <p className="text-sm">
                <strong>Status:</strong>{" "}
                {RECOMMENDATION_LABELS[score.recommendation_status]}
              </p>
              {score.matched_requirements.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-green-700">Matched</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {score.matched_requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {score.missing_requirements.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600">Missing</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {score.missing_requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {candidate.evidence.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium">AI Evidence</h3>
              <ul className="mt-2 space-y-2">
                {candidate.evidence.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg bg-stone-50 p-3 text-xs"
                  >
                    <strong>{e.field_name}:</strong> {e.field_value ?? "—"}
                    <p className="mt-1 italic text-ink-muted">
                      &ldquo;{e.evidence_text}&rdquo;
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-medium">Override score</label>
            <input
              type="number"
              min={0}
              max={100}
              value={overrideScore}
              onChange={(e) => setOverrideScore(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Candidate summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Recruiter notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {score?.interview_questions.length ? (
            <div>
              <h3 className="text-sm font-medium">Interview questions</h3>
              <ol className="mt-2 list-inside list-decimal text-sm">
                {score.interview_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveReview()}
              disabled={busy}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void saveReview("shortlisted")}
              disabled={busy}
              className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Shortlist
            </button>
            <button
              type="button"
              onClick={() => void saveReview("hm_review")}
              disabled={busy}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Send to HM
            </button>
            <button
              type="button"
              onClick={() => void saveReview("declined")}
              disabled={busy}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
