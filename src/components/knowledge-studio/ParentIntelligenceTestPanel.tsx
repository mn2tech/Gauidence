"use client";

import { useState } from "react";
import { GRADE_OPTIONS } from "@/lib/mcps-parent/constants";
import type { ParentIntelligenceDebugItem } from "@/lib/mcps-parent/types";
import SchoolSelect from "@/components/mcps-parent/SchoolSelect";

type ChildForm = {
  label: string;
  school: string;
  grade: string;
};

type FamilyItem = ParentIntelligenceDebugItem & {
  applies_to?: string[];
  district_wide?: boolean;
  merged_score?: number;
  original_scores?: number[];
};

const emptyChild = (): ChildForm => ({
  label: "",
  school: "",
  grade: "9",
});

export default function ParentIntelligenceTestPanel({
  projectSlug = "mcps-parent",
}: {
  projectSlug?: string;
}) {
  const [mode, setMode] = useState<"single" | "family">("family");
  const [school, setSchool] = useState("Sherwood High School");
  const [grade, setGrade] = useState("9");
  const [children, setChildren] = useState<ChildForm[]>([
    { label: "Matthew", school: "Sherwood High School", grade: "9" },
    { label: "Child 2", school: "Rosa M. Parks Middle School", grade: "6" },
    emptyChild(),
  ]);
  const [asOf, setAsOf] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FamilyItem[]>([]);
  const [meta, setMeta] = useState<string | null>(null);

  async function runSingle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/parent-intelligence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            school_name: school,
            grade_level: grade,
            as_of: asOf || undefined,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        as_of?: string;
        items?: ParentIntelligenceDebugItem[];
      };
      if (!res.ok) {
        setError(body.error ?? "Test failed.");
        return;
      }
      setItems(body.items ?? []);
      setMeta(
        `Single · as of ${body.as_of ? new Date(body.as_of).toLocaleString() : "now"} · ${body.items?.length ?? 0} items`
      );
    } finally {
      setBusy(false);
    }
  }

  async function runFamily() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/parent-intelligence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "family",
            children: children
              .filter((c) => c.school.trim())
              .map((c) => ({
                label: c.label || null,
                school_name: c.school,
                grade_level: c.grade,
              })),
            as_of: asOf || undefined,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        as_of?: string;
        items?: FamilyItem[];
        children?: Array<{ label: string | null; school_name: string }>;
      };
      if (!res.ok) {
        setError(body.error ?? "Family test failed.");
        return;
      }
      setItems(body.items ?? []);
      setMeta(
        `Family · as of ${body.as_of ? new Date(body.as_of).toLocaleString() : "now"} · ${body.items?.length ?? 0} merged items · ${(body.children ?? []).length} children`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Parent Intelligence Test</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Admin only — preview ranked parent-home items, including multi-child
          family merge.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("family")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            mode === "family"
              ? "bg-brand text-white"
              : "border border-stone-300 hover:bg-stone-50"
          }`}
        >
          Family View
        </button>
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            mode === "single"
              ? "bg-brand text-white"
              : "border border-stone-300 hover:bg-stone-50"
          }`}
        >
          Single School
        </button>
      </div>

      <input
        type="date"
        value={asOf}
        onChange={(e) => setAsOf(e.target.value)}
        className="rounded-md border border-stone-300 px-3 py-2 text-sm"
        title="Test as if today were…"
      />

      {mode === "single" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SchoolSelect value={school} onChange={setSchool} />
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="rounded-md border border-stone-300 px-3 py-2 text-sm"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          {children.map((child, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-lg border border-stone-100 bg-stone-50 p-3 sm:grid-cols-3"
            >
              <input
                value={child.label}
                onChange={(e) => {
                  const next = [...children];
                  next[idx] = { ...child, label: e.target.value };
                  setChildren(next);
                }}
                placeholder={`Child ${idx + 1} label (optional)`}
                className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              />
              <SchoolSelect
                value={child.school}
                onChange={(schoolName) => {
                  const next = [...children];
                  next[idx] = { ...child, school: schoolName };
                  setChildren(next);
                }}
                required={false}
                placeholder={idx === 2 ? "Optional third school" : "Select school"}
              />
              <select
                value={child.grade}
                onChange={(e) => {
                  const next = [...children];
                  next[idx] = { ...child, grade: e.target.value };
                  setChildren(next);
                }}
                className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void (mode === "family" ? runFamily() : runSingle())}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy
          ? "Running…"
          : mode === "family"
            ? "Run Family View"
            : "Run Parent View"}
      </button>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {meta ? <p className="text-xs text-ink-muted">{meta}</p> : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 pr-3">Score</th>
                <th className="py-1 pr-3">Title</th>
                <th className="py-1 pr-3">Applies to</th>
                <th className="py-1 pr-3">District?</th>
                <th className="py-1 pr-3">Category</th>
                <th className="py-1 pr-3">Event</th>
                <th className="py-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="py-1.5 pr-3 tabular-nums font-semibold">
                    {item.merged_score ?? item.score}
                    {item.original_scores?.length ? (
                      <span className="block font-normal text-ink-muted">
                        ({item.original_scores.join(", ")})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3">{item.title}</td>
                  <td className="py-1.5 pr-3">
                    {(item.applies_to ?? item.applies_to_labels ?? []).join(" · ") ||
                      "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {item.district_wide ? "yes" : "no"}
                  </td>
                  <td className="py-1.5 pr-3">{item.category}</td>
                  <td className="py-1.5 pr-3">{item.event_date ?? "—"}</td>
                  <td className="py-1.5">{item.source_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
