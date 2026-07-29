"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Loader2, X } from "lucide-react";
import { formatShortDate } from "@/lib/employee-hub/week";
import type { BusinessLeaveRequest } from "@/lib/employee-hub/types";

type Props = {
  businessProfileId: string;
};

export default function OwnerLeavePanel({ businessProfileId }: Props) {
  const [requests, setRequests] = useState<BusinessLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/employee-hub/leave/business?businessProfileId=${encodeURIComponent(businessProfileId)}&status=pending`
      );
      const body = await res.json();
      if (res.ok) {
        setRequests((body.requests as BusinessLeaveRequest[] | undefined) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, status: "approved" | "denied") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/employee-hub/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't update request.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Calendar className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">Leave requests</h2>
          <p className="text-xs text-ink-muted">Pending employee time-off requests</p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {requests.length === 0 ? (
            <li className="py-2 text-sm text-ink-muted">No pending leave requests.</li>
          ) : (
            requests.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{r.employee_name}</p>
                    <p className="text-sm text-ink-muted">
                      {formatShortDate(r.start_date)}
                      {r.end_date !== r.start_date
                        ? ` – ${formatShortDate(r.end_date)}`
                        : ""}{" "}
                      · {r.leave_type.toUpperCase()}
                    </p>
                    {r.reason ? (
                      <p className="mt-1 text-xs text-ink-muted">{r.reason}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void review(r.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void review(r.id, "denied")}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
                    >
                      <X className="h-3 w-3" />
                      Deny
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
