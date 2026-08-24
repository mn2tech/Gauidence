"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Pencil,
  Search,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { CATEGORY_LABELS } from "@/lib/personal-space/categories";
import type { PersonalKnowledgeCategory } from "@/lib/personal-space/types";

type KnowledgeItem = {
  id: string;
  kind: "entity" | "fact" | "relationship";
  title: string;
  subtitle?: string;
  category: PersonalKnowledgeCategory;
  status?: string;
  sourceFileName?: string | null;
  sourceDocumentId?: string | null;
};

type HealthPayload = {
  label: string;
  counts: {
    people: number;
    vehicles: number;
    documents: number;
    importantDates: number;
    commitments: number;
    organizations: number;
    events: number;
  };
  suggestedNextStep: string | null;
  visibleCategories: PersonalKnowledgeCategory[];
  items: KnowledgeItem[];
};

export default function MyKnowledgeScreen() {
  const { active } = useActiveProfile();
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/personal-space/knowledge?profileId=${encodeURIComponent(active.id)}`
      );
      const body = (await res.json()) as HealthPayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load knowledge");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [active?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.subtitle ?? "").toLowerCase().includes(q) ||
        CATEGORY_LABELS[i.category].toLowerCase().includes(q)
    );
  }, [data?.items, query]);

  const byCategory = useMemo(() => {
    const map = new Map<PersonalKnowledgeCategory, KnowledgeItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  async function handleDelete(item: KnowledgeItem) {
    if (!active?.id) return;
    if (!window.confirm(`Remove “${item.title}” from your knowledge?`)) return;
    const res = await fetch("/api/personal-space/knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: active.id,
        id: item.id,
        kind: item.kind,
      }),
    });
    if (res.ok) void load();
  }

  async function handleCorrect(item: KnowledgeItem) {
    if (!active?.id) return;
    const next = window.prompt(`Correct “${item.title}” to:`, item.title);
    if (!next?.trim()) return;
    const res = await fetch("/api/personal-space/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: active.id,
        id: item.id,
        kind: item.kind,
        action: "correct",
        value: next.trim(),
      }),
    });
    if (res.ok) void load();
  }

  if (!active) {
    return (
      <p className="p-6 text-sm text-ink-muted">
        Select a Space to view your knowledge.
      </p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {active.display_name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My Knowledge</h1>
        <p className="text-sm text-ink-muted">
          What Guardian remembers about you — edit or correct anytime.
        </p>
      </header>

      {data ? (
        <section className="simple-home-card space-y-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Knowledge Health</h2>
            <span className="text-xs font-medium text-brand">{data.label}</span>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <li>{data.counts.people} people</li>
            <li>{data.counts.vehicles} vehicles</li>
            <li>{data.counts.documents} documents</li>
            <li>{data.counts.importantDates} important dates</li>
            <li>{data.counts.commitments} commitments</li>
            <li>{data.counts.organizations} organizations</li>
          </ul>
          {data.suggestedNextStep ? (
            <p className="text-sm text-ink-muted">{data.suggestedNextStep}</p>
          ) : null}
        </section>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search my knowledge"
          className="w-full rounded-xl border border-border-subtle bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (data?.visibleCategories.length ?? 0) === 0 && filtered.length === 0 ? (
        <section className="simple-home-card space-y-3 p-5">
          <p className="text-sm text-ink-muted">
            Guardian hasn&apos;t learned anything here yet. Tell Gideon about
            yourself or add something.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ask?mode=about-me"
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Tell Guardian About Me
            </Link>
            <Link
              href="/add"
              className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold"
            >
              Add Something
            </Link>
          </div>
        </section>
      ) : (
        [...byCategory.entries()].map(([category, items]) => (
          <section key={category} className="space-y-2">
            <h2 className="text-sm font-semibold tracking-tight">
              {CATEGORY_LABELS[category]}
            </h2>
            <ul className="simple-home-card divide-y divide-border-subtle">
              {items.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.subtitle ? (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {item.subtitle}
                      </p>
                    ) : null}
                    {item.sourceFileName ? (
                      <p className="mt-1 text-xs text-brand">
                        Source: {item.sourceFileName}
                        {item.sourceDocumentId ? (
                          <Link
                            href={`/dashboard?docs=${item.sourceDocumentId}`}
                            className="ml-2 inline-flex items-center gap-0.5 underline"
                          >
                            View source
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Correct"
                      onClick={() => void handleCorrect(item)}
                      className="rounded-lg p-2 text-ink-muted hover:bg-brand-light/40 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => void handleDelete(item)}
                      className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
