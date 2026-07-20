"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Trophy } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  hobbiesOf,
  unlinkedOfTypes,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  parent: GuardianProfile;
};

export default function LinkedHobbiesPanel({ parent }: Props) {
  const { profiles, refresh, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const hobbies = useMemo(
    () => hobbiesOf(profiles, parent.id),
    [profiles, parent.id]
  );
  const unlinked = useMemo(
    () => unlinkedOfTypes(profiles, parent, ["hobby"]),
    [profiles, parent]
  );

  const linkExisting = async (profileId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProfileId: parent.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't link profile.");
        return;
      }
      setLinkOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const addHobby = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: "hobby",
          displayName: name.trim(),
          description: description.trim() || null,
          parentProfileId: parent.id,
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add hobby.");
        return;
      }
      setName("");
      setDescription("");
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
      if (!ok) setError("Couldn't open hobby vault.");
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
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Hobbies & sports
            </h2>
            <p className="text-xs text-ink-muted">
              Separate vaults linked to {parent.display_name}
            </p>
          </div>
        </div>
        {!open && (
          <div className="flex flex-wrap gap-2">
            {unlinked.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setLinkOpen((v) => !v);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
              >
                Link existing
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setLinkOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add hobby
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {linkOpen && unlinked.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          <li className="text-xs text-ink-muted">
            Move an existing hobby under {parent.display_name}:
          </li>
          {unlinked.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-sm font-medium">{p.display_name}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void linkExisting(p.id)}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                Link
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="text-sm text-ink-muted hover:text-foreground"
            >
              Cancel
            </button>
          </li>
        </ul>
      )}

      {open && (
        <form
          onSubmit={addHobby}
          className="mt-4 space-y-3 border-t border-stone-100 pt-4"
        >
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Golf"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">League / notes (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Weekend league, club membership…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add hobby
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
        {hobbies.length === 0 ? (
          <li className="py-3 text-sm text-ink-muted">
            No hobbies yet. Add golf, soccer, or another activity to keep
            schedules and notes in a separate vault under{" "}
            {parent.display_name}.
          </li>
        ) : (
          hobbies.map((hobby) => (
            <li
              key={hobby.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="text-sm font-medium">{hobby.display_name}</p>
                <p className="text-xs text-ink-muted">
                  {hobby.description?.trim() || "Hobby / sport"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openVault(hobby.id)}
                disabled={openingId === hobby.id}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                {openingId === hobby.id ? "Opening…" : "Open vault"}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
