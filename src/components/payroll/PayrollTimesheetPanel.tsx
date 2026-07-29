"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  employeesOf,
  type GuardianProfile,
} from "@/lib/profiles/types";

type TimeEntry = {
  id: string;
  employee_profile_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  notes: string | null;
};

type Props = {
  businessProfile: GuardianProfile;
};

export default function PayrollTimesheetPanel({ businessProfile }: Props) {
  const { profiles } = useActiveProfile();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const employees = useMemo(
    () => employeesOf(profiles, businessProfile.id),
    [profiles, businessProfile.id]
  );

  const today = new Date().toISOString().slice(0, 10);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payroll/time-entries?profileId=${encodeURIComponent(businessProfile.id)}&periodStart=${today}&periodEnd=${today}`
      );
      const body = await res.json();
      if (res.ok) setEntries(body.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [businessProfile.id, today]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const openEntryByEmployee = useMemo(() => {
    const map = new Map<string, TimeEntry>();
    for (const e of entries) {
      if (!e.clock_out_at) map.set(e.employee_profile_id, e);
    }
    return map;
  }, [entries]);

  async function clockIn(employeeProfileId: string) {
    setBusyId(employeeProfileId);
    setError(null);
    try {
      const res = await fetch("/api/payroll/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: businessProfile.id,
          employeeProfileId,
          clockInAt: new Date().toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't clock in.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clock in.");
    } finally {
      setBusyId(null);
    }
  }

  async function clockOut(entryId: string, employeeProfileId: string) {
    setBusyId(employeeProfileId);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/time-entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clockOutAt: new Date().toISOString() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't clock out.");
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clock out.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Timesheets</h2>
            <p className="text-xs text-ink-muted">
              Clock in and out for payroll hours
            </p>
          </div>
        </div>
        <Link
          href="/payroll"
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          Payroll reports →
        </Link>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading timesheets…
        </p>
      ) : employees.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Add employees above to start tracking hours.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {employees.map((emp) => {
            const open = openEntryByEmployee.get(emp.id);
            const isBusy = busyId === emp.id;
            return (
              <li
                key={emp.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{emp.display_name}</p>
                  <p className="text-xs text-ink-muted">
                    {open
                      ? `Clocked in since ${new Date(open.clock_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Not clocked in"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {open ? (
                    <button
                      type="button"
                      onClick={() => void clockOut(open.id, emp.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                      Clock out
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void clockIn(emp.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5" />
                      )}
                      Clock in
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
