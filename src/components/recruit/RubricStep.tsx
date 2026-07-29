"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_RUBRIC, RUBRIC_CATEGORIES, rubricTotal } from "@/lib/recruit/rubric";
import type { RecruitmentJobRequirements } from "@/lib/recruit/types";

type Props = {
  jobId: string;
  rubric: RecruitmentJobRequirements | null;
  onSaved: (rubric: RecruitmentJobRequirements) => void;
  onNext: () => void;
};

export default function RubricStep({ jobId, rubric, onSaved, onNext }: Props) {
  const initial = rubric ?? { ...DEFAULT_RUBRIC, id: "", job_id: jobId, created_at: "", updated_at: "" };
  const [weights, setWeights] = useState({
    weight_required_skills: initial.weight_required_skills,
    weight_relevant_experience: initial.weight_relevant_experience,
    weight_domain_experience: initial.weight_domain_experience,
    weight_preferred_skills: initial.weight_preferred_skills,
    weight_education_certifications: initial.weight_education_certifications,
    weight_career_stability: initial.weight_career_stability,
    weight_location_availability: initial.weight_location_availability,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rubricTotal(weights);

  async function handleSave(andNext = false) {
    if (total !== 100) {
      setError("Weights must total exactly 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/rubric`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weights),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        rubric?: RecruitmentJobRequirements;
      };
      if (!res.ok || !body.rubric) {
        setError(body.error ?? "Couldn't save rubric.");
        return;
      }
      onSaved(body.rubric);
      if (andNext) onNext();
    } catch {
      setError("Couldn't save rubric.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Configure Evaluation Criteria</h2>
      <p className="text-sm text-ink-muted">
        Adjust scoring weights before running analysis. Total must equal 100.
      </p>

      <div className="space-y-4">
        {RUBRIC_CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{cat.label}</p>
              <p className="text-xs text-ink-muted">{cat.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={50}
                value={weights[cat.key]}
                onChange={(e) =>
                  setWeights((w) => ({
                    ...w,
                    [cat.key]: parseInt(e.target.value, 10),
                  }))
                }
                className="w-32"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={weights[cat.key]}
                onChange={(e) =>
                  setWeights((w) => ({
                    ...w,
                    [cat.key]: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-16 rounded border border-stone-300 px-2 py-1 text-sm text-center"
              />
              <span className="text-sm text-ink-muted">%</span>
            </div>
          </div>
        ))}
      </div>

      <p
        className={`text-sm font-medium ${total === 100 ? "text-green-700" : "text-red-600"}`}
      >
        Total: {total}% {total === 100 ? "✓" : "(must equal 100)"}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setWeights({ ...DEFAULT_RUBRIC })}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          Reset defaults
        </button>
        <button
          type="button"
          onClick={() => void handleSave(true)}
          disabled={busy || total !== 100}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & analyze"}
        </button>
      </div>
    </div>
  );
}
