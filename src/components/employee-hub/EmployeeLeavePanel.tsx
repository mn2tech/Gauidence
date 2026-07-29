"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Calendar, Loader2 } from "lucide-react";
import type { EmployeeLeaveRequest } from "@/lib/employee-hub/types";
import { formatShortDate } from "@/lib/employee-hub/week";

type Props = {
  employeeProfileId: string;
};

export default function EmployeeLeavePanel({ employeeProfileId }: Props) {
  const [requests, setRequests] = useState<EmployeeLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<"pto" | "sick" | "ooo" | "other">("pto");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/employee-hub/leave?employeeProfileId=${encodeURIComponent(employeeProfileId)}`
      );
      const body = await res.json();
      if (res.ok) {
        setRequests((body.requests as EmployeeLeaveRequest[] | undefined) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [employeeProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employee-hub/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeProfileId,
          startDate,
          endDate,
          leaveType,
          reason: reason.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't submit request.");
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Calendar className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Leave &amp; OOO</h2>
            <p className="text-xs text-ink-muted">Request time away</p>
          </div>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
          >
            Request leave
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">End</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium">Type</span>
            <select
              value={leaveType}
              onChange={(e) =>
                setLeaveType(e.target.value as typeof leaveType)
              }
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            >
              <option value="pto">PTO</option>
              <option value="sick">Sick</option>
              <option value="ooo">Out of office</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {requests.length === 0 ? (
            <li className="py-2 text-sm text-ink-muted">No leave requests yet.</li>
          ) : (
            requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {formatShortDate(r.start_date)}
                  {r.end_date !== r.start_date
                    ? ` – ${formatShortDate(r.end_date)}`
                    : ""}{" "}
                  · {r.leave_type.toUpperCase()}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium capitalize">
                  {r.status}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
