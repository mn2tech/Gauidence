"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Plus } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import type { RecruitmentJob } from "@/lib/recruit/types";

type Props = {
  initialJobs: RecruitmentJob[];
};

export default function RecruitJobList({ initialJobs }: Props) {
  const { profiles } = useActiveProfile();
  const businessProfiles = profiles.filter((p) =>
    isOrgStyleProfile(p.profile_type)
  );

  const [jobs, setJobs] = useState(initialJobs);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [profileId, setProfileId] = useState(
    businessProfiles[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !profileId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recruit/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          title: title.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        job?: RecruitmentJob;
      };
      if (!res.ok || !body.job) {
        setError(body.error ?? "Couldn't create job.");
        return;
      }
      setJobs((prev) => [body.job!, ...prev]);
      setTitle("");
      setShowForm(false);
      window.location.href = `/recruit/${body.job.id}`;
    } catch {
      setError("Couldn't create job. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          disabled={businessProfiles.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New job
        </button>
      </div>

      {businessProfiles.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Create a business vault first in Settings → Profiles to use Guardian
          Recruit.
        </p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold">New recruitment job</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Business vault</label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              >
                {businessProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Job title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Software Engineer"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create & continue
          </button>
        </form>
      ) : null}

      <ul className="mt-6 space-y-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/recruit/${job.id}`}
              className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300 hover:shadow"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light">
                <Briefcase className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{job.title}</p>
                <p className="text-sm text-ink-muted">
                  {job.department ?? "No department"} · {job.status}
                </p>
              </div>
              <span className="text-xs text-ink-muted">
                {new Date(job.updated_at).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {jobs.length === 0 && !showForm ? (
        <p className="mt-8 text-center text-sm text-ink-muted">
          No recruitment jobs yet. Create one to get started.
        </p>
      ) : null}
    </div>
  );
}
