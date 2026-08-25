"use client";

import { useState, type FormEvent } from "react";
import { GRADE_OPTIONS } from "@/lib/mcps-parent/constants";
import { resolveMcpsSchoolName } from "@/lib/mcps-parent/schools";
import SchoolSelect from "./SchoolSelect";

export default function MySchoolSetup({
  initialSchool = "",
  initialGrade = "9",
  onSaved,
}: {
  initialSchool?: string;
  initialGrade?: string;
  onSaved?: () => void;
}) {
  const [school, setSchool] = useState(initialSchool);
  const [grade, setGrade] = useState(initialGrade);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcps-parent/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_name: resolveMcpsSchoolName(school) ?? school.trim(),
          grade_level: grade,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save.");
        return;
      }
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mx-auto max-w-md space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My School</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Select your school and grade so Guardian can show what matters for
          your family. No student ID or ParentVUE login needed.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="school">
          School
        </label>
        <SchoolSelect
          id="school"
          required
          value={school}
          onChange={setSchool}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="grade">
          Grade
        </label>
        <select
          id="grade"
          required
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        >
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g === "K" || g === "Pre-K" ? g : `Grade ${g}`}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
