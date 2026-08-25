"use client";

import { useState } from "react";
import { GRADE_OPTIONS } from "@/lib/mcps-parent/constants";
import type { ParentIntelligenceDebugItem } from "@/lib/mcps-parent/types";

export default function ParentIntelligenceTestPanel({
  projectSlug = "mcps-parent",
}: {
  projectSlug?: string;
}) {
  const [school, setSchool] = useState("Sherwood High School");
  const [grade, setGrade] = useState("9");
  const [asOf, setAsOf] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ParentIntelligenceDebugItem[]>([]);
  const [meta, setMeta] = useState<string | null>(null);

  async function run() {
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
        `As of ${body.as_of ? new Date(body.as_of).toLocaleString() : "now"} · ${body.items?.length ?? 0} ranked items`
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
          Admin only — preview ranked parent-home items with scores and reasons.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          placeholder="School"
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
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
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
          title="Test as if today were…"
        />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? "Running…" : "Run Parent View"}
      </button>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      {meta ? <p className="text-xs text-ink-muted">{meta}</p> : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 pr-3">Score</th>
                <th className="py-1 pr-3">Title</th>
                <th className="py-1 pr-3">Reasons</th>
                <th className="py-1 pr-3">Category</th>
                <th className="py-1 pr-3">Event date</th>
                <th className="py-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-stone-100">
                  <td className="py-1.5 pr-3 tabular-nums font-semibold">
                    {item.score}
                  </td>
                  <td className="py-1.5 pr-3">{item.title}</td>
                  <td className="py-1.5 pr-3">{item.reasons.join("; ")}</td>
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
