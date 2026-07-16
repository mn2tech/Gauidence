"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import ProfileOrganizeList from "@/components/ProfileOrganizeList";
import ProfileVaultMap from "@/components/ProfileVaultMap";
import {
  PROFILE_CREATE_GROUPS,
  canAttachChildToParent,
  optionsForCreateGroup,
  topLevelProfiles,
  type GuardianProfile,
  type ProfileCreateGroupId,
} from "@/lib/profiles/types";

export default function ProfilesManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profiles, active, accountName, refresh, switchProfile } =
    useActiveProfile();
  const [adding, setAdding] = useState(searchParams.get("add") === "1");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [groupId, setGroupId] = useState<ProfileCreateGroupId | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GuardianProfile | null>(null);

  const groupOptions = useMemo(
    () => (groupId ? optionsForCreateGroup(groupId) : []),
    [groupId]
  );
  const option = useMemo(
    () => groupOptions.find((o) => o.id === optionId) ?? null,
    [groupOptions, optionId]
  );

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setAdding(true);
      const raw = searchParams.get("group");
      if (
        raw === "family" ||
        raw === "business" ||
        raw === "student" ||
        raw === "other"
      ) {
        setGroupId(raw);
        setStep(2);
      }
    }
  }, [searchParams]);

  const startAdd = () => {
    setAdding(true);
    setStep(1);
    setGroupId(null);
    setOptionId(null);
    setDisplayName("");
    setExtra({});
    setError(null);
  };

  /** If there's exactly one matching container, nest new people/assets under it. */
  const suggestedParentId = useMemo(() => {
    if (!option || !groupId) return null;
    if (groupId === "family" || groupId === "student") {
      const families = topLevelProfiles(profiles).filter(
        (p) => p.profile_type === "family"
      );
      if (families.length !== 1) return null;
      const parent = families[0]!;
      return canAttachChildToParent(option.profileType, parent.profile_type)
        ? parent.id
        : null;
    }
    if (groupId === "business") {
      const orgs = topLevelProfiles(profiles).filter(
        (p) => p.profile_type === "business" || p.profile_type === "non_profit"
      );
      if (orgs.length !== 1) return null;
      const parent = orgs[0]!;
      return canAttachChildToParent(option.profileType, parent.profile_type)
        ? parent.id
        : null;
    }
    return null;
  }, [option, groupId, profiles]);

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
          parentProfileId: suggestedParentId,
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
      router.replace("/dashboard");
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

  const moveUnder = async (
    profileId: string,
    parentProfileId: string | null
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProfileId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't move profile.");
        return;
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
    } finally {
      setBusy(false);
    }
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            People & spaces
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            One login, separate vaults for each person, business, or place.
            Active:{" "}
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
            Add someone or something
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
                Who or what is this for?
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Start with Family, Business, Student, or Other.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PROFILE_CREATE_GROUPS.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupId(g.id);
                        setOptionId(null);
                        setStep(2);
                      }}
                      className="flex h-full w-full flex-col rounded-xl border border-stone-200 px-3 py-3 text-left transition hover:border-brand hover:bg-brand-light/40"
                    >
                      <span className="text-sm font-semibold">{g.label}</span>
                      <span className="mt-1 text-xs text-ink-muted">
                        {g.description}
                      </span>
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
          ) : step === 2 ? (
            <>
              <h2 className="text-base font-semibold">
                {PROFILE_CREATE_GROUPS.find((g) => g.id === groupId)?.label ??
                  "Choose type"}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Pick what you want to add under this category.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {groupOptions.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOptionId(o.id);
                        setStep(3);
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
                onClick={() => {
                  setStep(1);
                  setGroupId(null);
                  setOptionId(null);
                }}
                className="mt-4 text-sm text-ink-muted hover:text-foreground"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">
                {option?.label ?? "New profile"}
              </h2>
              {suggestedParentId ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Will be nested under your existing{" "}
                  {groupId === "business" ? "Business" : "Family"} space.
                </p>
              ) : null}
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
                  onClick={() => {
                    setStep(2);
                    setOptionId(null);
                  }}
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
                  {busy ? "Adding…" : "Add to Guardian"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileVaultMap
            profiles={profiles}
            ownerLabel={accountName}
            activeId={active?.id}
            busy={busy}
            onSwitch={(id) => void switchProfile(id)}
            onMoveUnder={moveUnder}
          />
          <ProfileOrganizeList
          profiles={profiles}
          activeId={active?.id}
          busy={busy}
          editing={editing}
          setEditing={setEditing}
          onSaveEdit={() => void saveEdit()}
          onSwitch={(id) => void switchProfile(id)}
          onSetDefault={(id) => void setDefault(id)}
          onRemove={(p) => void remove(p)}
          onMoveUnder={moveUnder}
          onRefresh={refresh}
          onAvatarError={(message) => setError(message || null)}
        />
        </div>
      )}
    </div>
  );
}
