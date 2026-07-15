"use client";

import { useMemo, useState, type FormEvent } from "react";
import { GraduationCap, Loader2, Plus } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  studentsOf,
  unlinkedOfTypes,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  parent: GuardianProfile;
};

export default function LinkedStudentsPanel({ parent }: Props) {
  const { profiles, refresh, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [name, setName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const students = useMemo(
    () => studentsOf(profiles, parent.id),
    [profiles, parent.id]
  );
  const unlinked = useMemo(
    () => unlinkedOfTypes(profiles, parent, ["student"]),
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

  const addStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: "student",
          displayName: name.trim(),
          schoolName: schoolName.trim() || null,
          gradeLevel: gradeLevel.trim() || null,
          parentProfileId: parent.id,
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add student.");
        return;
      }
      setName("");
      setSchoolName("");
      setGradeLevel("");
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
      if (!ok) setError("Couldn't open student vault.");
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
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Students</h2>
            <p className="text-xs text-ink-muted">
              Separate school vaults linked to {parent.display_name}
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
              Add student
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
            Move an existing student under {parent.display_name}:
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
          onSubmit={addStudent}
          className="mt-4 space-y-3 border-t border-stone-100 pt-4"
        >
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Maya"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">School (optional)</span>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Lincoln High"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Grade (optional)</span>
            <input
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="10th"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add student
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
        {students.length === 0 ? (
          <li className="py-3 text-sm text-ink-muted">
            No students yet. Add one to keep school docs, grades, and forms in a
            separate vault under this family.
          </li>
        ) : (
          students.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <p className="text-sm font-medium">{s.display_name}</p>
                <p className="text-xs text-ink-muted">
                  {[s.school_name, s.grade_level].filter(Boolean).join(" · ") ||
                    "Student"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openVault(s.id)}
                disabled={openingId === s.id}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
              >
                {openingId === s.id ? "Opening…" : "Open vault"}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
