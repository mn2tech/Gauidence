"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Users } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canManageProfileAccess,
  canEditGuardianProfile,
  employmentKindLabel,
  employeesOf,
  type GuardianProfile,
} from "@/lib/profiles/types";
import EmployeeEntitlementsPanel from "@/components/employee-hub/EmployeeEntitlementsPanel";
import ContractorIntakePanel from "@/components/intake/ContractorIntakePanel";

type Props = {
  parent: GuardianProfile;
};

export default function LinkedEmployeesPanel({ parent }: Props) {
  const { profiles, refresh, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [intakeEmployeeId, setIntakeEmployeeId] = useState<string | null>(null);

  const employees = useMemo(
    () => employeesOf(profiles, parent.id),
    [profiles, parent.id]
  );

  const addEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: "employee",
          displayName: name.trim(),
          jobTitle: jobTitle.trim() || null,
          department: department.trim() || null,
          parentProfileId: parent.id,
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add employee.");
        return;
      }
      setName("");
      setJobTitle("");
      setDepartment("");
      setOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openVault = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const ok = await switchProfile(id);
      if (!ok) setError("Couldn't open employee vault.");
      else window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Employees</h2>
            <p className="text-xs text-ink-muted">
              Separate vaults linked to {parent.display_name}
            </p>
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add employee
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {open && (
        <form onSubmit={addEmployee} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Jordan Lee"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-muted">Job title (optional)</span>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                placeholder="Operations manager"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Department (optional)</span>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                placeholder="Operations"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add employee
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="mt-4 divide-y divide-stone-100">
        {employees.length === 0 ? (
          <li className="py-3 text-sm text-ink-muted">
            No employees yet. Add one to keep their documents and logs in a
            separate vault under this organization.
          </li>
        ) : (
          employees.map((emp) => (
            <li
              key={emp.id}
              className="flex flex-col gap-2 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{emp.display_name}</p>
                  <p className="text-xs text-ink-muted">
                    {[emp.job_title, emp.department].filter(Boolean).join(" · ") ||
                      "Employee"}
                    {emp.employment_kind ? (
                      <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted ring-1 ring-stone-200">
                        {employmentKindLabel(emp.employment_kind)}
                      </span>
                    ) : null}
                  </p>
                  {emp.contact_email || emp.contact_phone ? (
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {[emp.contact_email, emp.contact_phone].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEditGuardianProfile(parent) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setIntakeEmployeeId(
                          intakeEmployeeId === emp.id ? null : emp.id
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-stone-50 ${
                        intakeEmployeeId === emp.id
                          ? "border-brand bg-brand-light text-brand-dark"
                          : "border-stone-300"
                      }`}
                    >
                      Request SSN
                    </button>
                  ) : null}
                  {canManageProfileAccess(emp) ? (
                    <Link
                      href={`/settings/profiles/${emp.id}/collaborators`}
                      className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
                    >
                      Invite
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void openVault(emp.id)}
                    disabled={openingId === emp.id}
                    className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
                  >
                    {openingId === emp.id ? "Opening…" : "Open vault"}
                  </button>
                </div>
              </div>
              {canManageProfileAccess(emp) ? (
                <EmployeeEntitlementsPanel
                  employeeProfileId={emp.id}
                  employeeName={emp.display_name}
                  initial={null}
                />
              ) : null}
              {canEditGuardianProfile(parent) ? (
                <ContractorIntakePanel
                  businessProfileId={parent.id}
                  employeeProfileId={emp.id}
                  employeeName={emp.display_name}
                  open={intakeEmployeeId === emp.id}
                  onOpenChange={(next) =>
                    setIntakeEmployeeId(next ? emp.id : null)
                  }
                />
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
