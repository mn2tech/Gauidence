"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Users } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  familyMembersOf,
  profileTypeLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  parent: GuardianProfile;
};

const ROLE_OPTIONS: { optionId: string; label: string }[] = [
  { optionId: "child", label: "Child" },
  { optionId: "spouse", label: "Spouse or partner" },
  { optionId: "parent", label: "Parent" },
  { optionId: "family", label: "Family member" },
  { optionId: "student", label: "Student" },
];

export default function LinkedFamilyPanel({ parent }: Props) {
  const { profiles, refresh, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleOptionId, setRoleOptionId] = useState("child");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const members = useMemo(
    () => familyMembersOf(profiles, parent.id),
    [profiles, parent.id]
  );

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: roleOptionId,
          displayName: name.trim(),
          parentProfileId: parent.id,
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add family member.");
        return;
      }
      setName("");
      setRoleOptionId("child");
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
      if (!ok) setError("Couldn't open family member vault.");
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
            <h2 className="text-base font-semibold tracking-tight">
              Family members
            </h2>
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
            Add member
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {open && (
        <form
          onSubmit={addMember}
          className="mt-4 space-y-3 border-t border-stone-100 pt-4"
        >
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Alex"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Role</span>
            <select
              value={roleOptionId}
              onChange={(e) => setRoleOptionId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.optionId} value={r.optionId}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add member
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
        {members.length === 0 ? (
          <li className="py-3 text-sm text-ink-muted">
            No family members yet. Add a child, spouse, or other relative to
            keep their documents in a separate vault under this family.
          </li>
        ) : (
          members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="text-sm font-medium">{m.display_name}</p>
                <p className="text-xs text-ink-muted">
                  {m.relationship?.trim() || profileTypeLabel(m.profile_type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openVault(m.id)}
                disabled={openingId === m.id}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                {openingId === m.id ? "Opening…" : "Open vault"}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
