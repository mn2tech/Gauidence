"use client";

import { useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";

type Props = {
  experts: ExpertCatalogItem[];
};

type AssignMode = "assign" | "grant";

type AssignResponse = {
  installation?: { id: string; expert_id: string; profile_id: string };
  created?: boolean;
  emailed?: boolean;
  grantOnly?: boolean;
  entitled?: boolean;
  message?: string;
  error?: string;
};

export default function AdminExpertAssignForm({ experts }: Props) {
  const [targetEmail, setTargetEmail] = useState("");
  const [expertId, setExpertId] = useState(
    experts.find((e) => e.id === "empi-coordinator")?.id ?? experts[0]?.id ?? ""
  );
  const [profileId, setProfileId] = useState("");
  const [mode, setMode] = useState<AssignMode>("assign");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grantOnly = mode === "grant";

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
        profileId: grantOnly ? undefined : profileId.trim() || undefined,
        grantOnly,
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
          The user must already have a Guardian account with Experts access enabled.
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
              {expert.name} ({expert.status}
              {expert.visibility === "public" ? ", public" : ", restricted"})
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Action</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 px-4 py-3">
          <input
            type="radio"
            name="assignMode"
            value="assign"
            checked={mode === "assign"}
            onChange={() => setMode("assign")}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Assign &amp; install</span>
            <span className="mt-0.5 block text-ink-muted">
              Grants access and installs the expert on the user&apos;s vault (default
              profile unless you specify one below).
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 px-4 py-3">
          <input
            type="radio"
            name="assignMode"
            value="grant"
            checked={mode === "grant"}
            onChange={() => setMode("grant")}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Grant access only</span>
            <span className="mt-0.5 block text-ink-muted">
              User can see the expert in their catalog and choose which vault to install
              it on.
            </span>
          </span>
        </label>
      </fieldset>

      {!grantOnly ? (
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
            className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 font-mono text-xs"
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result?.message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">{result.message}</p>
          {result.installation ? (
            <p className="mt-1 font-mono text-xs">
              Installation: {result.installation.id}
            </p>
          ) : null}
          {result.grantOnly ? (
            <p className="mt-2 text-emerald-900">
              The user will see this expert under{" "}
              <span className="font-semibold">Guardian Experts</span> (
              <code className="text-xs">/experts</code>) and can install it themselves.
            </p>
          ) : null}
          {result.emailed ? (
            <p className="mt-2 text-emerald-900">
              A notification email was sent to the user.
            </p>
          ) : result.created ? (
            <p className="mt-2 text-emerald-900">
              No email was sent — check <code className="text-xs">RESEND_API_KEY</code>{" "}
              on the server.
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || !expertId}
        className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {loading
          ? grantOnly
            ? "Granting…"
            : "Assigning…"
          : grantOnly
            ? "Grant access"
            : "Assign expert"}
      </button>
    </form>
  );
}
