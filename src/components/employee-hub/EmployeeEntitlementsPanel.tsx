"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import type { EmployeeHubEntitlements } from "@/lib/employee-hub/types";

type Props = {
  employeeProfileId: string;
  employeeName: string;
  initial: EmployeeHubEntitlements | null;
  onUpdated?: () => void;
};

const FEATURES: {
  key: keyof Omit<
    EmployeeHubEntitlements,
    "id" | "business_profile_id" | "employee_profile_id" | "created_at" | "updated_at"
  >;
  label: string;
  description: string;
}[] = [
  { key: "time_tracking", label: "Clock in/out", description: "Live punch clock" },
  { key: "manual_time_entry", label: "Manual hours", description: "Enter daily hours" },
  { key: "status_reports", label: "Status reports", description: "Daily work updates" },
  { key: "leave_requests", label: "Leave requests", description: "PTO and OOO" },
  { key: "invoice_upload", label: "Invoices", description: "Contractor invoice upload" },
  { key: "documents", label: "Documents", description: "Full document vault" },
  { key: "gideon_chat", label: "Ask Gideon", description: "Scoped assistant" },
  { key: "research", label: "Research", description: "Company research" },
  { key: "work_memory", label: "Work Memory", description: "Persistent work context" },
  { key: "experts", label: "Experts", description: "Expert marketplace" },
  { key: "recruit", label: "Recruit", description: "Hiring tools" },
  { key: "payroll_admin", label: "Payroll admin", description: "Payroll reports" },
];

export default function EmployeeEntitlementsPanel({
  employeeProfileId,
  employeeName,
  initial,
  onUpdated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [entitlements, setEntitlements] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || entitlements) return;
    setLoading(true);
    void fetch(
      `/api/employee-hub/entitlements?employeeProfileId=${encodeURIComponent(employeeProfileId)}`
    )
      .then((res) => res.json())
      .then((body) => {
        if (body.entitlements) {
          setEntitlements(body.entitlements as EmployeeHubEntitlements);
        }
      })
      .finally(() => setLoading(false));
  }, [open, entitlements, employeeProfileId]);

  async function toggle(
    key: (typeof FEATURES)[number]["key"],
    value: boolean
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employee-hub/entitlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeProfileId, [key]: value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't update.");
      setEntitlements(body.entitlements as EmployeeHubEntitlements);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-50"
      >
        <Settings2 className="h-3 w-3" />
        Access
      </button>

      {open ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-medium text-ink-muted">
            Features for {employeeName}
          </p>
          {loading ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          {entitlements ? (
          <ul className="mt-2 space-y-2">
            {FEATURES.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{f.label}</p>
                  <p className="text-xs text-ink-muted">{f.description}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle(f.key, !entitlements[f.key])}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    entitlements[f.key] ? "bg-brand" : "bg-stone-300"
                  }`}
                  aria-pressed={entitlements[f.key]}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      entitlements[f.key] ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
          ) : null}
          {busy ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
