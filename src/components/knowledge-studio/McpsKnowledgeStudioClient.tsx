"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  CategoryDashboardStats,
  KnowledgeProjectCategoryRow,
  KnowledgeProjectRow,
  KnowledgeSourceRow,
  ProjectDashboardStats,
} from "@/lib/knowledge-studio/projects/types";
import { MCPS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";
import TestGideonPanel from "@/components/knowledge-studio/TestGideonPanel";
import ParentIntelligenceTestPanel from "@/components/knowledge-studio/ParentIntelligenceTestPanel";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "published") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (s === "needs_review" || s === "draft")
    return "bg-amber-100 text-amber-900 border-amber-300";
  if (s === "failed") return "bg-red-100 text-red-900 border-red-300";
  if (s === "fetching") return "bg-sky-50 text-sky-900 border-sky-200";
  return "bg-stone-100 text-stone-700 border-stone-300";
}

export default function McpsKnowledgeStudioClient({
  projectSlug = MCPS_PROJECT_SLUG,
}: {
  projectSlug?: string;
}) {
  const [project, setProject] = useState<KnowledgeProjectRow | null>(null);
  const [categories, setCategories] = useState<KnowledgeProjectCategoryRow[]>(
    []
  );
  const [dashboard, setDashboard] = useState<ProjectDashboardStats | null>(
    null
  );
  const [sources, setSources] = useState<KnowledgeSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/knowledge-studio/projects/${projectSlug}`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      project?: KnowledgeProjectRow;
      categories?: KnowledgeProjectCategoryRow[];
      dashboard?: ProjectDashboardStats;
      sources?: KnowledgeSourceRow[];
    };
    if (!res.ok) {
      setError(body.error ?? "Could not load project.");
      setLoading(false);
      return;
    }
    setProject(body.project ?? null);
    setCategories(body.categories ?? []);
    setDashboard(body.dashboard ?? null);
    setSources(body.sources ?? []);
    setLoading(false);
  }, [projectSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runRefresh() {
    setRefreshing(true);
    setRefreshNote(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/refresh`,
        { method: "POST" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        changed?: number;
        unchanged?: number;
        failed?: number;
      };
      if (!res.ok) {
        setError(body.error ?? "Refresh failed.");
        return;
      }
      setRefreshNote(
        `Refresh complete: ${body.changed ?? 0} changed, ${body.unchanged ?? 0} unchanged, ${body.failed ?? 0} failed.`
      );
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const stats = dashboard ?? {
    sources: 0,
    published: 0,
    needs_review: 0,
    failed: 0,
    last_refresh: null,
    categories: [] as CategoryDashboardStats[],
  };

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {refreshNote ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {refreshNote}
        </p>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          {project?.name ?? "MCPS Parent Knowledge"}
        </h1>
        {project?.disclaimer ? (
          <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">
            {project.disclaimer}
          </p>
        ) : null}

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Sources
            </dt>
            <dd className="mt-1 text-2xl font-semibold">{stats.sources}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Published
            </dt>
            <dd className="mt-1 text-2xl font-semibold">{stats.published}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Needs Review
            </dt>
            <dd className="mt-1 text-2xl font-semibold">{stats.needs_review}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Failed
            </dt>
            <dd className="mt-1 text-2xl font-semibold">{stats.failed}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Last Refresh
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {formatWhen(stats.last_refresh)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/knowledge-studio/${projectSlug}/sources/new`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Add Source
          </Link>
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void runRefresh()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Run Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setShowTest((v) => !v)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
          >
            {showTest ? "Hide tests" : "Test Gideon"}
          </button>
        </div>
      </section>

      {showTest ? (
        <div className="space-y-6">
          <TestGideonPanel projectSlug={projectSlug} />
          <ParentIntelligenceTestPanel projectSlug={projectSlug} />
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Knowledge categories</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Sources</th>
                <th className="px-4 py-3 font-medium text-right">Published</th>
                <th className="px-4 py-3 font-medium text-right">
                  Needs Review
                </th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.categories?.length
                ? dashboard.categories
                : categories.map((c) => ({
                    slug: c.slug,
                    name: c.name,
                    sources: 0,
                    published: 0,
                    needs_review: 0,
                  }))
              ).map((row) => (
                <tr
                  key={row.slug}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.sources}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.published}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.needs_review}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sources</h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No sources yet. Add 10–20 high-value official MCPS URLs manually.
          </p>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">
                      {source.source_name}
                    </h3>
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(source.status)}`}
                    >
                      {String(source.status).replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {source.category} · {source.authority} ·{" "}
                    {source.refresh_frequency}
                  </p>
                  <a
                    href={source.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-brand hover:underline"
                  >
                    {source.source_url}
                  </a>
                  <p className="mt-1 text-xs text-ink-muted">
                    Last checked: {formatWhen(source.last_checked_at)}
                  </p>
                </div>
                <Link
                  href={`/knowledge-studio/${projectSlug}/sources/${source.id}`}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
