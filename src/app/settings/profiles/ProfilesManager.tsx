"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  clientsOf,
  employeesOf,
  PROFILE_CREATE_OPTIONS,
  profileSubtitle,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";

function NestedMemberRow({
  child,
  activeId,
  busy,
  editing,
  setEditing,
  onSaveEdit,
  onSwitch,
  onSetDefault,
  onRemove,
}: {
  child: GuardianProfile;
  activeId?: string;
  busy: boolean;
  editing: GuardianProfile | null;
  setEditing: (p: GuardianProfile | null) => void;
  onSaveEdit: () => void;
  onSwitch: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  if (editing?.id === child.id) {
    return (
      <li className="rounded-xl bg-stone-50 px-3 py-2">
        <div className="space-y-2">
          <input
            value={editing.display_name}
            onChange={(e) =>
              setEditing({ ...editing, display_name: e.target.value })
            }
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onSaveEdit}
              className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {child.display_name}
          {child.is_default ? (
            <span className="ml-2 text-[11px] font-medium text-brand">
              Default
            </span>
          ) : null}
          {activeId === child.id ? (
            <span className="ml-2 text-[11px] font-medium text-ink-muted">
              Active
            </span>
          ) : null}
        </p>
        <p className="text-[11px] text-ink-muted">
          {profileTypeLabel(child.profile_type)}
          {child.job_title ? ` · ${child.job_title}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeId !== child.id && (
          <button
            type="button"
            onClick={onSwitch}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
          >
            Switch
          </button>
        )}
        {!child.is_default && (
          <button
            type="button"
            disabled={busy}
            onClick={onSetDefault}
            className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
          >
            Make default
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(child)}
          className="rounded-full border border-stone-300 px-2.5 py-1 text-[11px] font-medium"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${child.display_name}`}
          className="inline-flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>
    </li>
  );
}

export default function ProfilesManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, active, refresh, switchProfile } = useActiveProfile();
  const [adding, setAdding] = useState(searchParams.get("add") === "1");
  const [step, setStep] = useState<1 | 2>(1);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GuardianProfile | null>(null);

  const option = useMemo(
    () => PROFILE_CREATE_OPTIONS.find((o) => o.id === optionId) ?? null,
    [optionId]
  );

  useEffect(() => {
    if (searchParams.get("add") === "1") setAdding(true);
  }, [searchParams]);

  const startAdd = () => {
    setAdding(true);
    setStep(1);
    setOptionId(null);
    setDisplayName("");
    setExtra({});
    setError(null);
  };

  const create = async () => {
    if (!option || !displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: option.id,
          displayName: displayName.trim(),
          relationship: option.relationship ?? extra.relationship ?? null,
          dateOfBirth: extra.dateOfBirth || null,
          schoolName: extra.schoolName || null,
          gradeLevel: extra.gradeLevel || null,
          businessLegalName: extra.businessLegalName || null,
          industry: extra.industry || null,
          website: extra.website || null,
          description: extra.description || null,
          jobTitle: extra.jobTitle || null,
          department: extra.department || null,
          organizationName: extra.organizationName || null,
          switchTo: true,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create profile.");
        return;
      }
      await refresh();
      setAdding(false);
      router.replace("/settings/profiles");
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.display_name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editing.display_name,
          relationship: editing.relationship,
          schoolName: editing.school_name,
          gradeLevel: editing.grade_level,
          businessLegalName: editing.business_legal_name,
          industry: editing.industry,
          website: editing.website,
          description: editing.description,
          jobTitle: editing.job_title,
          department: editing.department,
          organizationName: editing.organization_name,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save profile.");
        return;
      }
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefault: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't set default.");
        return;
      }
      await refresh();
      window.dispatchEvent(
        new CustomEvent("guardian:profile-changed", {
          detail: { profileId: id },
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: GuardianProfile) => {
    setError(null);
    const first = await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
    const firstBody = (await first.json().catch(() => ({}))) as {
      error?: string;
      requiresConfirmation?: boolean;
      documentCount?: number;
    };
    if (first.status === 409 && firstBody.requiresConfirmation) {
      const ok = window.confirm(
        `${firstBody.error ?? "This profile contains documents and Guardian data."}\n\nDelete this profile and all ${firstBody.documentCount ?? ""} associated documents? This cannot be undone.`
      );
      if (!ok) return;
      const second = await fetch(
        `/api/profiles/${p.id}?confirmDeleteData=true`,
        { method: "DELETE" }
      );
      const secondBody = (await second.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!second.ok) {
        setError(secondBody.error ?? "Couldn't delete profile.");
        return;
      }
    } else if (!first.ok) {
      setError(firstBody.error ?? "Couldn't delete profile.");
      return;
    }
    await refresh();
    window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
  };

  const isBiz =
    option?.profileType === "business" || option?.profileType === "non_profit";
  const isChild =
    option?.profileType === "child" || option?.profileType === "student";
  const isEmployee = option?.profileType === "employee";
  const isClient = option?.profileType === "client";
  const isVehicle = option?.profileType === "vehicle";
  const isHome = option?.profileType === "home";
  const isPet = option?.profileType === "pet";
  const orgNameLabel =
    option?.profileType === "non_profit" ? "Nonprofit name" : "Business name";
  const nameLabel = isBiz
    ? orgNameLabel
    : isVehicle
      ? "Vehicle name"
      : isHome
        ? "Home name"
        : isPet
          ? "Pet name"
          : "Display name";
  const namePlaceholder = isBiz
    ? option?.profileType === "non_profit"
      ? "Community Foundation"
      : "NM2TECH LLC"
    : isVehicle
      ? "2019 Honda Civic"
      : isHome
        ? "Oak Street home"
        : isPet
          ? "Buddy"
          : "Name";
  const detailsLabel = isVehicle
    ? "Year / make / model notes (optional)"
    : isHome
      ? "Address or notes (optional)"
      : isPet
        ? "Species / breed (optional)"
        : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Profiles</h1>
          <p className="mt-1 text-sm text-ink-muted">
            One login, separate vaults. Active:{" "}
            <span className="font-medium text-foreground">
              {active?.display_name ?? "—"}
            </span>
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            Add Profile
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {adding ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          {step === 1 ? (
            <>
              <h2 className="text-base font-semibold">
                Who or what is this profile for?
              </h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {PROFILE_CREATE_OPTIONS.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOptionId(o.id);
                        setStep(2);
                        setDisplayName("");
                      }}
                      className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm font-medium transition hover:border-brand hover:bg-brand-light/40"
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="mt-4 text-sm text-ink-muted hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">
                {option?.label ?? "New profile"}
              </h2>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="font-medium">{nameLabel}</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                    placeholder={namePlaceholder}
                  />
                </label>
                {detailsLabel && (
                  <label className="block text-sm">
                    <span className="text-ink-muted">{detailsLabel}</span>
                    <input
                      value={extra.description ?? ""}
                      onChange={(e) =>
                        setExtra((x) => ({ ...x, description: e.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      placeholder={
                        isVehicle
                          ? "Silver, VIN last 4 optional"
                          : isHome
                            ? "123 Oak St"
                            : "Golden retriever"
                      }
                    />
                  </label>
                )}
                {isChild && (
                  <>
                    <label className="block text-sm">
                      <span className="text-ink-muted">School (optional)</span>
                      <input
                        value={extra.schoolName ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({ ...x, schoolName: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-ink-muted">Grade (optional)</span>
                      <input
                        value={extra.gradeLevel ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({ ...x, gradeLevel: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                  </>
                )}
                {isBiz && (
                  <>
                    <label className="block text-sm">
                      <span className="text-ink-muted">Legal name (optional)</span>
                      <input
                        value={extra.businessLegalName ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({
                            ...x,
                            businessLegalName: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-ink-muted">Industry (optional)</span>
                      <input
                        value={extra.industry ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({ ...x, industry: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                  </>
                )}
                {isEmployee && (
                  <>
                    <label className="block text-sm">
                      <span className="text-ink-muted">Job title (optional)</span>
                      <input
                        value={extra.jobTitle ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({ ...x, jobTitle: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-ink-muted">
                        Organization (optional)
                      </span>
                      <input
                        value={extra.organizationName ?? ""}
                        onChange={(e) =>
                          setExtra((x) => ({
                            ...x,
                            organizationName: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      />
                    </label>
                  </>
                )}
                {isClient && (
                  <label className="block text-sm">
                    <span className="text-ink-muted">Company (optional)</span>
                    <input
                      value={extra.organizationName ?? ""}
                      onChange={(e) =>
                        setExtra((x) => ({
                          ...x,
                          organizationName: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                    />
                  </label>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || !displayName.trim()}
                  onClick={() => void create()}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create profile"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {topLevelProfiles(profiles).map((p) => {
            const nestedEmployees = canHaveLinkedEmployees(p.profile_type)
              ? employeesOf(profiles, p.id)
              : [];
            const nestedClients = canHaveLinkedClients(p.profile_type)
              ? clientsOf(profiles, p.id)
              : [];
            const nested = [...nestedEmployees, ...nestedClients];
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                {editing?.id === p.id ? (
                  <div className="space-y-3">
                    <input
                      value={editing.display_name}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          display_name: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                        className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {p.display_name}
                        {p.is_default ? (
                          <span className="ml-2 text-[11px] font-medium text-brand">
                            Default
                          </span>
                        ) : null}
                        {active?.id === p.id ? (
                          <span className="ml-2 text-[11px] font-medium text-ink-muted">
                            Active
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {profileSubtitle(p)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {active?.id !== p.id && (
                        <button
                          type="button"
                          onClick={() => void switchProfile(p.id)}
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                        >
                          Switch
                        </button>
                      )}
                      {!p.is_default && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setDefault(p.id)}
                          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                        >
                          Make default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(p)}
                        aria-label={`Delete ${p.display_name}`}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {nested.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
                    {nestedEmployees.length > 0 ? (
                      <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                        Employees
                      </li>
                    ) : null}
                    {nestedEmployees.map((child) => (
                      <NestedMemberRow
                        key={child.id}
                        child={child}
                        activeId={active?.id}
                        busy={busy}
                        editing={editing}
                        setEditing={setEditing}
                        onSaveEdit={() => void saveEdit()}
                        onSwitch={() => void switchProfile(child.id)}
                        onSetDefault={() => void setDefault(child.id)}
                        onRemove={() => void remove(child)}
                      />
                    ))}
                    {nestedClients.length > 0 ? (
                      <li className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                        Clients
                      </li>
                    ) : null}
                    {nestedClients.map((child) => (
                      <NestedMemberRow
                        key={child.id}
                        child={child}
                        activeId={active?.id}
                        busy={busy}
                        editing={editing}
                        setEditing={setEditing}
                        onSaveEdit={() => void saveEdit()}
                        onSwitch={() => void switchProfile(child.id)}
                        onSetDefault={() => void setDefault(child.id)}
                        onRemove={() => void remove(child)}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
