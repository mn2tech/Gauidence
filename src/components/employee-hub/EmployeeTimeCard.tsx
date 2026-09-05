"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock, Loader2, LogIn, LogOut } from "lucide-react";
import type { EmployeeHubEntitlements } from "@/lib/employee-hub/types";
import { formatShortDate, formatWeekday, weekBounds, weekDays } from "@/lib/employee-hub/week";
import { todayLogDate } from "@/lib/logs/types";

type TimeEntry = {
  id: string;
  entry_type: "punch" | "manual";
  work_date: string | null;
  manual_hours: number | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

type Props = {
  employeeProfileId: string;
  businessProfileId: string;
  entitlements: Pick<EmployeeHubEntitlements, "time_tracking" | "manual_time_entry">;
};

function hoursForDay(entries: TimeEntry[], date: string): number {
  let total = 0;
  for (const e of entries) {
    if (e.entry_type === "manual" && e.work_date === date && e.manual_hours != null) {
      total += e.manual_hours;
      continue;
    }
    if (!e.clock_in_at || !e.clock_out_at) continue;
    const day = e.clock_in_at.slice(0, 10);
    if (day !== date) continue;
    const ms =
      new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime();
    if (ms > 0) total += ms / (1000 * 60 * 60);
  }
  return Math.round(total * 100) / 100;
}

export default function EmployeeTimeCard({
  employeeProfileId,
  businessProfileId,
  entitlements,
}: Props) {
  const today = todayLogDate();
  const { start: weekStart, end: weekEnd } = weekBounds(today);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualHours, setManualHours] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payroll/time-entries?profileId=${encodeURIComponent(businessProfileId)}&employeeProfileId=${encodeURIComponent(employeeProfileId)}&periodStart=${weekStart}&periodEnd=${weekEnd}`
      );
      const body = await res.json();
      if (res.ok) {
        const list = (body.entries as TimeEntry[] | undefined) ?? [];
        setEntries(list);
        setOpenEntry(list.find((e) => e.entry_type === "punch" && !e.clock_out_at) ?? null);
        const manual: Record<string, string> = {};
        for (const e of list) {
          if (e.entry_type === "manual" && e.work_date && e.manual_hours != null) {
            manual[e.work_date] = String(e.manual_hours);
          }
        }
        setManualHours(manual);
      }
    } finally {
      setLoading(false);
    }
  }, [businessProfileId, employeeProfileId, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingDays = days.filter((d) => {
    if (d > today) return false;
    return hoursForDay(entries, d) === 0 && !openEntry?.clock_in_at?.startsWith(d);
  });

  const weekTotal = useMemo(() => {
    let total = 0;
    for (const d of days) total += hoursForDay(entries, d);
    return Math.round(total * 100) / 100;
  }, [days, entries]);

  async function clockIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: businessProfileId,
          employeeProfileId,
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

  async function saveManualHours(date: string) {
    const raw = manualHours[date]?.trim();
    if (!raw) return;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError("Enter hours between 0.25 and 24.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/time-entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: businessProfileId,
          employeeProfileId,
          workDate: date,
          hours,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save hours.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save hours.");
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
          <h2 className="text-base font-semibold tracking-tight">Time</h2>
          <p className="text-xs text-ink-muted">
            Week of {formatShortDate(weekStart)} — {weekTotal} hrs
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {missingDays.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Missing time for {missingDays.map(formatShortDate).join(", ")}.
        </p>
      ) : null}

      {entitlements.time_tracking ? (
        <div className="mt-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                {openEntry
                  ? `Clocked in since ${new Date(openEntry.clock_in_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
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
            </>
          )}
        </div>
      ) : null}

      {entitlements.manual_time_entry ? (
        <div className="mt-6 border-t border-stone-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">This week</p>
            <p className="text-sm font-semibold tabular-nums">
              {weekTotal}{" "}
              <span className="text-xs font-normal text-ink-muted">hrs total</span>
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {days.map((date) => (
              <label key={date} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-ink-muted">
                  {formatWeekday(date)}
                </span>
                <input
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={manualHours[date] ?? ""}
                  onChange={(e) =>
                    setManualHours((prev) => ({ ...prev, [date]: e.target.value }))
                  }
                  onBlur={() => void saveManualHours(date)}
                  disabled={busy || date > today}
                  placeholder={hoursForDay(entries, date) ? String(hoursForDay(entries, date)) : "hrs"}
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-sm outline-none ring-brand focus:ring-2 disabled:bg-stone-50"
                />
                <span className="text-xs text-ink-muted">hrs</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
