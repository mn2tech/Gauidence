"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { RecruitmentJob } from "@/lib/recruit/types";

type Props = {
  job: RecruitmentJob;
  onSaved: (job: RecruitmentJob) => void;
  onNext: () => void;
};

const WORK_MODE_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

function parseLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function JobFormStep({ job, onSaved, onNext }: Props) {
  const [form, setForm] = useState({
    title: job.title,
    department: job.department ?? "",
    hiring_manager: job.hiring_manager ?? "",
    job_description: job.job_description,
    required_skills: job.required_skills.join(", "),
    preferred_skills: job.preferred_skills.join(", "),
    min_years_experience: job.min_years_experience?.toString() ?? "",
    required_education: job.required_education ?? "",
    required_certifications: job.required_certifications.join(", "),
    location: job.location ?? "",
    work_mode: job.work_mode ?? "",
    employment_type: job.employment_type ?? "",
    work_authorization_requirement: job.work_authorization_requirement ?? "",
    salary_range: job.salary_range ?? "",
    shortlist_count: job.shortlist_count,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(andNext = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruit/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          department: form.department || null,
          hiring_manager: form.hiring_manager || null,
          job_description: form.job_description,
          required_skills: parseLines(form.required_skills),
          preferred_skills: parseLines(form.preferred_skills),
          min_years_experience: form.min_years_experience
            ? parseFloat(form.min_years_experience)
            : null,
          required_education: form.required_education || null,
          required_certifications: parseLines(form.required_certifications),
          location: form.location || null,
          work_mode: form.work_mode || null,
          employment_type: form.employment_type || null,
          work_authorization_requirement:
            form.work_authorization_requirement || null,
          salary_range: form.salary_range || null,
          shortlist_count: form.shortlist_count,
          current_step: andNext ? "upload_resumes" : "create_job",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        job?: RecruitmentJob;
      };
      if (!res.ok || !body.job) {
        setError(body.error ?? "Couldn't save job.");
        return;
      }
      onSaved(body.job);
      if (andNext) onNext();
    } catch {
      setError("Couldn't save job. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: string,
    key: keyof typeof form,
    opts?: { multiline?: boolean; type?: string }
  ) => (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {opts?.multiline ? (
        <textarea
          value={form[key] as string}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          rows={4}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      ) : (
        <input
          type={opts?.type ?? "text"}
          value={form[key] as string | number}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              [key]:
                opts?.type === "number"
                  ? parseInt(e.target.value, 10) || 0
                  : e.target.value,
            }))
          }
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Create Job</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("Job title *", "title")}
        {field("Department", "department")}
        {field("Hiring manager", "hiring_manager")}
        {field("Location", "location")}
        <div>
          <label className="text-sm font-medium">Work mode</label>
          <select
            value={form.work_mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, work_mode: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            {WORK_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {field("Employment type", "employment_type")}
        {field("Min. years of experience", "min_years_experience", {
          type: "number",
        })}
        {field("Required education", "required_education")}
        {field("Work authorization requirement", "work_authorization_requirement")}
        {field("Salary / rate range", "salary_range")}
        {field("Candidates to shortlist", "shortlist_count", {
          type: "number",
        })}
      </div>
      {field("Job description", "job_description", { multiline: true })}
      {field("Required skills (comma or line separated)", "required_skills", {
        multiline: true,
      })}
      {field("Preferred skills (comma or line separated)", "preferred_skills", {
        multiline: true,
      })}
      {field(
        "Required certifications (comma or line separated)",
        "required_certifications",
        { multiline: true }
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleSave(false)}
          disabled={busy}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave(true)}
          disabled={busy || !form.title.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          Save & continue
        </button>
      </div>
    </div>
  );
}
