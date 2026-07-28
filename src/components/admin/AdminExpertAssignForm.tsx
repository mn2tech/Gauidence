"use client";

import { useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";

type Props = {
  experts: ExpertCatalogItem[];
};

type AssignResponse = {
  installation?: { id: string; expert_id: string; profile_id: string };
  created?: boolean;
  message?: string;
  error?: string;
};

export default function AdminExpertAssignForm({ experts }: Props) {
  const [targetEmail, setTargetEmail] = useState("");
  const [expertId, setExpertId] = useState(
    experts.find((e) => e.id === "empi-coordinator")?.id ?? experts[0]?.id ?? ""
  );
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/admin/experts/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetEmail,
        expertId,
        profileId: profileId.trim() || undefined,
      }),
    });

    const data = (await res.json()) as AssignResponse;
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Assignment failed.");
      return;
    }

    setResult(data);
    if (data.created) {
      setTargetEmail("");
      setProfileId("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="targetEmail" className="block text-sm font-medium">
          User email
        </label>
        <input
          id="targetEmail"
          type="email"
          required
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="coordinator@hospital.org"
          className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          The user must already have a Guardian account. Assignment uses their
          default vault unless you specify a profile ID.
        </p>
      </div>

      <div>
        <label htmlFor="expertId" className="block text-sm font-medium">
          Expert
        </label>
        <select
          id="expertId"
          required
          value={expertId}
          onChange={(e) => setExpertId(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
        >
          {experts.map((expert) => (
            <option key={expert.id} value={expert.id}>
              {expert.name} ({expert.status})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="profileId" className="block text-sm font-medium">
          Profile ID <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="profileId"
          type="text"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          placeholder="Leave blank for default vault"
          className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-mono text-xs"
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result?.installation ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">{result.message}</p>
          <p className="mt-1 font-mono text-xs">
            Installation: {result.installation.id}
          </p>
          <p className="mt-2 text-emerald-900">
            The user can open it from{" "}
            <span className="font-semibold">Guardian Experts</span> (
            <code className="text-xs">/experts</code>).
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || !expertId}
        className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? "Assigning…" : "Assign expert"}
      </button>
    </form>
  );
}
