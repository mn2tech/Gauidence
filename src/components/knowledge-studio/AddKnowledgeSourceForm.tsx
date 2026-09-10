"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CLS_PROJECT_SLUG,
  MCPS_AUTHORITY,
  MCPS_CATEGORY_DEFS,
} from "@/lib/knowledge-studio/projects/constants";
import { inferSourceHintsFromUrl } from "@/lib/knowledge-studio/projects/pure";
import {
  KNOWLEDGE_SCOPES,
  REFRESH_FREQUENCIES,
  type KnowledgeScope,
} from "@/lib/knowledge-studio/projects/types";

type StarterSource = {
  source_name: string;
  source_url: string;
  category: string;
};

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export default function AddKnowledgeSourceForm({
  projectSlug,
  authorityDefault = MCPS_AUTHORITY,
  categories = MCPS_CATEGORY_DEFS.map((c) => ({
    slug: c.slug,
    name: c.name,
  })),
  defaultScope = "district",
  schoolDefault = "",
  starterSources = [],
}: {
  projectSlug: string;
  authorityDefault?: string;
  categories?: Array<{ slug: string; name: string }>;
  defaultScope?: KnowledgeScope;
  schoolDefault?: string;
  starterSources?: ReadonlyArray<StarterSource>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "calendar");
  const [authority, setAuthority] = useState(authorityDefault);
  const [scope, setScope] = useState<KnowledgeScope>(defaultScope);
  const [refreshFrequency, setRefreshFrequency] = useState("manual");
  const [school, setSchool] = useState(schoolDefault);
  const [gradeLevel, setGradeLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [autoHint, setAutoHint] = useState<string | null>(null);
  const [existingByUrl, setExistingByUrl] = useState<
    Record<string, { id: string; status: string }>
  >({});

  const categorySlugs = categories.map((c) => c.slug);
  const urlHint =
    projectSlug === CLS_PROJECT_SLUG
      ? "Public HTTPS pages on covenantlifeschool.org. Category is filled from the URL when possible."
      : "Public HTTPS pages or PDFs on montgomeryschoolsmd.org only.";

  const loadExisting = useCallback(async () => {
    if (!starterSources.length) return;
    const res = await fetch(`/api/knowledge-studio/projects/${projectSlug}`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      sources?: Array<{ id: string; source_url: string; status: string }>;
    };
    if (!res.ok || !body.sources) return;
    const map: Record<string, { id: string; status: string }> = {};
    for (const s of body.sources) {
      map[normalizeUrlKey(s.source_url)] = { id: s.id, status: s.status };
    }
    setExistingByUrl(map);
  }, [projectSlug, starterSources.length]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  function applyUrlHints(nextUrl: string) {
    setSourceUrl(nextUrl);
    const hints = inferSourceHintsFromUrl(nextUrl, categorySlugs);
    if (hints.category && !categoryTouched) {
      setCategory(hints.category);
      const label =
        categories.find((c) => c.slug === hints.category)?.name ??
        hints.category;
      setAutoHint(`Category set to ${label} from URL.`);
    } else if (!hints.category) {
      setAutoHint(null);
    }
    if (hints.sourceName && !nameTouched) {
      setSourceName(hints.sourceName);
    }
  }

  function useStarter(starter: StarterSource) {
    const existing = existingByUrl[normalizeUrlKey(starter.source_url)];
    if (existing) {
      router.push(`/knowledge-studio/${projectSlug}/sources/${existing.id}`);
      return;
    }
    setError(null);
    setNameTouched(false);
    setCategoryTouched(false);
    setSourceName(starter.source_name);
    setCategory(starter.category);
    setSourceUrl(starter.source_url);
    setAutoHint(
      `Filled from starter · ${
        categories.find((c) => c.slug === starter.category)?.name ??
        starter.category
      }`
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const existing = existingByUrl[normalizeUrlKey(sourceUrl)];
      if (existing) {
        setError(
          "A source with this URL already exists. Open it from the starter list or project Sources."
        );
        setBusy(false);
        return;
      }

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
        if (/already exists/i.test(body.error ?? "")) {
          await loadExisting();
        }
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
  const missingStarters = starterSources.filter(
    (s) => !existingByUrl[normalizeUrlKey(s.source_url)]
  );

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {starterSources.length ? (
        <details
          open
          className="rounded-xl border border-stone-200 bg-stone-50 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Suggested starter URLs ({missingStarters.length} left of{" "}
            {starterSources.length})
          </summary>
          <p className="mt-2 text-xs text-ink-muted">
            Tap Use to fill the form, or Review if already added. Homepage is
            already in — pick Admissions, Parent Resources, or Faculty Directory
            next.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {starterSources.map((s) => {
              const existing = existingByUrl[normalizeUrlKey(s.source_url)];
              return (
                <li
                  key={s.source_url}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0 flex-1 break-all">
                    <span className="font-medium">{s.source_name}</span>
                    <span className="text-ink-muted"> · {s.category}</span>
                    {existing ? (
                      <span className="ml-2 inline-flex rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                        {String(existing.status).replace(/_/g, " ")}
                      </span>
                    ) : null}
                    <br />
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand hover:underline"
                    >
                      {s.source_url}
                    </a>
                  </div>
                  {existing ? (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/knowledge-studio/${projectSlug}/sources/${existing.id}`
                        )
                      }
                      className="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-semibold hover:bg-stone-50"
                    >
                      Review
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => useStarter(s)}
                      className="rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark hover:bg-brand/20"
                    >
                      Use
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
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
            onChange={(e) => applyUrlHints(e.target.value)}
            onBlur={(e) => applyUrlHints(e.target.value.trim())}
            placeholder={
              projectSlug === CLS_PROJECT_SLUG
                ? "https://www.covenantlifeschool.org/..."
                : "https://www.montgomeryschoolsmd.org/..."
            }
          />
          <p className="text-xs text-ink-muted">{urlHint}</p>
          {autoHint ? (
            <p className="text-xs font-medium text-emerald-800">{autoHint}</p>
          ) : null}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className={label} htmlFor="source_name">
            Source Name *
          </label>
          <input
            id="source_name"
            required
            className={field}
            value={sourceName}
            onChange={(e) => {
              setNameTouched(true);
              setSourceName(e.target.value);
            }}
            placeholder={
              projectSlug === CLS_PROJECT_SLUG
                ? "CLS Admissions"
                : "MCPS School Calendar"
            }
          />
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
            onChange={(e) => {
              setCategoryTouched(true);
              setCategory(e.target.value);
              setAutoHint(null);
            }}
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
            onChange={(e) => setScope(e.target.value as KnowledgeScope)}
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
