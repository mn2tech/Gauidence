"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  MCPS_AUTHORITY,
  MCPS_CATEGORY_DEFS,
} from "@/lib/knowledge-studio/projects/constants";
import {
  KNOWLEDGE_SCOPES,
  REFRESH_FREQUENCIES,
} from "@/lib/knowledge-studio/projects/types";

export default function AddKnowledgeSourceForm({
  projectSlug,
  authorityDefault = MCPS_AUTHORITY,
  categories = MCPS_CATEGORY_DEFS.map((c) => ({
    slug: c.slug,
    name: c.name,
  })),
}: {
  projectSlug: string;
  authorityDefault?: string;
  categories?: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "calendar");
  const [authority, setAuthority] = useState(authorityDefault);
  const [scope, setScope] = useState("district");
  const [refreshFrequency, setRefreshFrequency] = useState("manual");
  const [school, setSchool] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_name: sourceName,
            source_url: sourceUrl,
            category,
            authority,
            scope,
            refresh_frequency: refreshFrequency,
            school: school || null,
            grade_level: gradeLevel || null,
            notes: notes || null,
            effective_date: effectiveDate || null,
            expires_at: expiresAt || null,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        source?: { id: string };
      };
      if (!res.ok) {
        setError(body.error ?? "Could not add source.");
        return;
      }
      if (body.source?.id) {
        router.push(
          `/knowledge-studio/${projectSlug}/sources/${body.source.id}`
        );
        return;
      }
      router.push(`/knowledge-studio/${projectSlug}`);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-stone-300 px-3 py-2 text-sm bg-white";
  const label = "block text-sm font-medium text-foreground";

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className={label} htmlFor="source_name">
            Source Name *
          </label>
          <input
            id="source_name"
            required
            className={field}
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="MCPS School Calendar"
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className={label} htmlFor="source_url">
            Source URL *
          </label>
          <input
            id="source_url"
            required
            type="url"
            className={field}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.montgomeryschoolsmd.org/..."
          />
          <p className="text-xs text-ink-muted">
            Public HTTPS pages or PDFs on montgomeryschoolsmd.org only.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="category">
            Category *
          </label>
          <select
            id="category"
            required
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="authority">
            Authority *
          </label>
          <input
            id="authority"
            required
            className={field}
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="scope">
            Knowledge Scope *
          </label>
          <select
            id="scope"
            required
            className={field}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {KNOWLEDGE_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="refresh_frequency">
            Refresh Frequency *
          </label>
          <select
            id="refresh_frequency"
            required
            className={field}
            value={refreshFrequency}
            onChange={(e) => setRefreshFrequency(e.target.value)}
          >
            {REFRESH_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="school">
            School
          </label>
          <input
            id="school"
            className={field}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="grade_level">
            Grade Level
          </label>
          <input
            id="grade_level"
            className={field}
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="effective_date">
            Effective Date
          </label>
          <input
            id="effective_date"
            type="date"
            className={field}
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className={label} htmlFor="expires_at">
            Expiration Date
          </label>
          <input
            id="expires_at"
            type="date"
            className={field}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className={label} htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            className={field}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional admin notes"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Fetching & extracting…" : "Add Source"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.push(`/knowledge-studio/${projectSlug}`)}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
