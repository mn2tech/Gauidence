"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, LogIn, LogOut } from "lucide-react";
import type { GuardianProfile } from "@/lib/profiles/types";

type TimeEntry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
};

type Props = {
  employeeProfile: GuardianProfile;
  businessProfileId: string;
};

/** Self-service clock in/out for an employee vault. */
export default function EmployeeClockPanel({
  employeeProfile,
  businessProfileId,
}: Props) {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payroll/time-entries?profileId=${encodeURIComponent(businessProfileId)}&employeeProfileId=${encodeURIComponent(employeeProfile.id)}&periodStart=${today}&periodEnd=${today}`
      );
      const body = await res.json();
      if (res.ok) {
        const open = (body.entries as TimeEntry[] | undefined)?.find(
          (e) => !e.clock_out_at
        );
        setOpenEntry(open ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, employeeProfile.id, today]);

  useEffect(() => {
    void load();
  }, [load]);

  async function clockIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: businessProfileId,
          employeeProfileId: employeeProfile.id,
          clockInAt: new Date().toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't clock in.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    if (!openEntry) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/time-entries/${openEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clockOutAt: new Date().toISOString() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't clock out.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clock out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Clock className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">My hours</h2>
          <p className="text-xs text-ink-muted">Clock in and out for payroll</p>
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
        <div className="mt-4">
          <p className="text-sm text-ink-muted">
            {openEntry
              ? `Clocked in since ${new Date(openEntry.clock_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "You are not clocked in."}
          </p>
          <div className="mt-3">
            {openEntry ? (
              <button
                type="button"
                onClick={() => void clockOut()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Clock out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void clockIn()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Clock in
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
