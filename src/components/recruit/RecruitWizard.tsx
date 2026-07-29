"use client";

import { useCallback, useState } from "react";
import type {
  CandidateWithDetails,
  RecruitmentJob,
  RecruitmentJobRequirements,
  RecruitStep,
} from "@/lib/recruit/types";
import RecruitStepNav from "./RecruitStepNav";
import RecruitSafetyNotice from "./RecruitSafetyNotice";
import JobFormStep from "./JobFormStep";
import ResumeUploadStep from "./ResumeUploadStep";
import RubricStep from "./RubricStep";
import AnalyzeStep from "./AnalyzeStep";
import RankingDashboard from "./RankingDashboard";
import CandidateReviewPanel from "./CandidateReviewPanel";
import ExportStep from "./ExportStep";

type Props = {
  initialJob: RecruitmentJob;
  initialRubric: RecruitmentJobRequirements | null;
  initialCandidates: CandidateWithDetails[];
};

export default function RecruitWizard({
  initialJob,
  initialRubric,
  initialCandidates,
}: Props) {
  const [job, setJob] = useState(initialJob);
  const [rubric, setRubric] = useState(initialRubric);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [step, setStep] = useState<RecruitStep>(job.current_step);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );

  const refreshCandidates = useCallback(async () => {
    const res = await fetch(`/api/recruit/jobs/${job.id}/candidates`);
    const body = (await res.json().catch(() => ({}))) as {
      candidates?: CandidateWithDetails[];
    };
    if (body.candidates) setCandidates(body.candidates);
  }, [job.id]);

  const goToStep = useCallback(
    async (next: RecruitStep) => {
      setStep(next);
      await fetch(`/api/recruit/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: next }),
      });
      setJob((j) => ({ ...j, current_step: next }));
    },
    [job.id]
  );

  const pendingCount = candidates.filter(
    (c) =>
      c.processing_status === "pending" ||
      c.processing_status === "failed" ||
      c.processing_status === "extracted"
  ).length;

  const selectedCandidate = selectedCandidateId
    ? candidates.find((c) => c.id === selectedCandidateId)
    : null;

  async function handleRankChange(candidateId: string, rank: number) {
    await fetch(`/api/recruit/jobs/${job.id}/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual_rank: rank }),
    });
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId ? { ...c, manual_rank: rank } : c
      )
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {job.department ?? "No department"} · {candidates.length} candidate
          {candidates.length === 1 ? "" : "s"}
        </p>
      </div>

      <RecruitStepNav currentStep={step} onStepClick={(s) => void goToStep(s)} />

      <RecruitSafetyNotice />

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        {step === "create_job" ? (
          <JobFormStep
            job={job}
            onSaved={setJob}
            onNext={() => void goToStep("upload_resumes")}
          />
        ) : null}

        {step === "upload_resumes" ? (
          <ResumeUploadStep
            jobId={job.id}
            candidates={candidates}
            onUploaded={() => void refreshCandidates()}
            onNext={() => void goToStep("configure_criteria")}
          />
        ) : null}

        {step === "configure_criteria" ? (
          <RubricStep
            jobId={job.id}
            rubric={rubric}
            onSaved={setRubric}
            onNext={() => void goToStep("analyze")}
          />
        ) : null}

        {step === "analyze" ? (
          <AnalyzeStep
            jobId={job.id}
            pendingCount={pendingCount}
            onComplete={() => void refreshCandidates()}
            onNext={() => void goToStep("review")}
          />
        ) : null}

        {step === "review" || step === "shortlist" ? (
          <RankingDashboard
            candidates={candidates}
            onSelectCandidate={setSelectedCandidateId}
            onRankChange={(id, rank) => void handleRankChange(id, rank)}
          />
        ) : null}

        {step === "review" || step === "shortlist" ? (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void goToStep("shortlist")}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
            >
              Mark as shortlist step
            </button>
            <button
              type="button"
              onClick={() => void goToStep("export")}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Continue to export
            </button>
          </div>
        ) : null}

        {step === "export" ? (
          <ExportStep jobId={job.id} jobTitle={job.title} />
        ) : null}
      </div>

      {selectedCandidate ? (
        <CandidateReviewPanel
          jobId={job.id}
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidateId(null)}
          onUpdated={() => void refreshCandidates()}
        />
      ) : null}
    </div>
  );
}
