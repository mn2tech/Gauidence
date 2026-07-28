"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";

type Entitlement = {
  id: string;
  userId: string;
  expertId: string;
  email: string | null;
  fullName: string | null;
  grantedAt: string;
  installationCount: number;
};

type Props = {
  experts: ExpertCatalogItem[];
  refreshKey?: number;
};

function formatGrantedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminExpertEntitlementsPanel({ experts, refreshKey = 0 }: Props) {
  const [expertFilter, setExpertFilter] = useState("all");
  const [emailQuery, setEmailQuery] = useState("");
  const [appliedEmail, setAppliedEmail] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  const expertNameById = Object.fromEntries(experts.map((expert) => [expert.id, expert.name]));

  const loadEntitlements = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (expertFilter !== "all") params.set("expertId", expertFilter);
    if (appliedEmail.trim()) params.set("email", appliedEmail.trim());

    const res = await fetch(
      `/api/admin/experts/entitlements${params.size ? `?${params.toString()}` : ""}`
    );
    const data = (await res.json()) as {
      entitlements?: Entitlement[];
      error?: string;
    };

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Couldn't load access list.");
      setEntitlements([]);
      return;
    }

    setEntitlements(data.entitlements ?? []);
  }, [appliedEmail, expertFilter]);

  useEffect(() => {
    void loadEntitlements();
  }, [loadEntitlements, refreshKey]);

  async function handleRevoke(entitlement: Entitlement) {
    const expertName = expertNameById[entitlement.expertId] ?? entitlement.expertId;
    const who = entitlement.email ?? entitlement.userId;
    const installNote =
      entitlement.installationCount > 0
        ? ` This will also remove ${entitlement.installationCount} installation(s).`
        : "";

    if (
      !window.confirm(
        `Revoke ${expertName} access for ${who}?${installNote}`
      )
    ) {
      return;
    }

    const key = `${entitlement.userId}:${entitlement.expertId}`;
    setRevokingKey(key);
    setError(null);

    const res = await fetch("/api/admin/experts/entitlements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: entitlement.userId,
        expertId: entitlement.expertId,
      }),
    });

    const data = (await res.json()) as { error?: string };
    setRevokingKey(null);

    if (!res.ok) {
      setError(data.error ?? "Couldn't revoke access.");
      return;
    }

    await loadEntitlements();
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setAppliedEmail(emailQuery);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Who has access</h2>
        <p className="mt-1 text-sm text-ink-muted">
          View and revoke restricted expert access. Revoking also uninstalls the expert
          from the user&apos;s vault(s).
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="expertFilter" className="block text-sm font-medium">
            Expert
          </label>
          <select
            id="expertFilter"
            value={expertFilter}
            onChange={(e) => setExpertFilter(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
          >
            <option value="all">All experts</option>
            {experts.map((expert) => (
              <option key={expert.id} value={expert.id}>
                {expert.name}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div className="flex-1">
            <label htmlFor="emailFilter" className="block text-sm font-medium">
              User email
            </label>
            <input
              id="emailFilter"
              type="search"
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              placeholder="Filter by email"
              className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="mt-auto rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
          >
            Search
          </button>
        </form>
      </div>

      {appliedEmail ? (
        <p className="text-xs text-ink-muted">
          Showing results for &ldquo;{appliedEmail}&rdquo;.{" "}
          <button
            type="button"
            onClick={() => {
              setEmailQuery("");
              setAppliedEmail("");
            }}
            className="text-brand hover:underline"
          >
            Clear
          </button>
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading access list…</p>
      ) : entitlements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-ink-muted">
          No matching access grants found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Expert</th>
                <th className="px-4 py-3">Granted</th>
                <th className="px-4 py-3">Installed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {entitlements.map((entitlement) => {
                const revokeKey = `${entitlement.userId}:${entitlement.expertId}`;
                return (
                  <tr key={entitlement.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {entitlement.email ?? "Unknown email"}
                      </p>
                      {entitlement.fullName ? (
                        <p className="text-xs text-ink-muted">{entitlement.fullName}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {expertNameById[entitlement.expertId] ?? entitlement.expertId}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatGrantedAt(entitlement.grantedAt)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {entitlement.installationCount > 0
                        ? `${entitlement.installationCount} vault(s)`
                        : "Not installed"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={revokingKey === revokeKey}
                        onClick={() => void handleRevoke(entitlement)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {revokingKey === revokeKey ? "Revoking…" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
