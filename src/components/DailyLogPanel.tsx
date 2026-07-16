"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BookOpen,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import MoveDailyLogButton from "@/components/MoveDailyLogButton";
import {
  categoriesForProfileType,
  formatLogDayHeading,
  todayLogDate,
  type DailyLog,
} from "@/lib/logs/types";
import type { GuardianProfileType } from "@/lib/profiles/types";

type Props = {
  profileId: string;
  profileName: string;
  profileType: GuardianProfileType;
};

export default function DailyLogPanel({
  profileId,
  profileName,
  profileType,
}: Props) {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [savingQuick, setSavingQuick] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [logDate, setLogDate] = useState(todayLogDate());
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DailyLog | null>(null);
  const [q, setQ] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const categories = useMemo(
    () => categoriesForProfileType(profileType),
    [profileType]
  );

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ profileId });
      if (q.trim()) params.set("q", q.trim());
      if (filterCategory) params.set("category", filterCategory);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      const res = await fetch(`/api/logs?${params}`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        logs?: DailyLog[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load Daily Logs.");
        setLogs([]);
        return;
      }
      setLogs(body.logs ?? []);
    } catch {
      setError("Couldn't load Daily Logs.");
    } finally {
      setLoading(false);
    }
  }, [profileId, q, filterCategory, filterFrom, filterTo]);

  useEffect(() => {
    setLogs([]);
    setQuick("");
    setComposerOpen(false);
    setEditing(null);
    void load();
  }, [load]);

  useEffect(() => {
    const onProfile = () => {
      setLogs([]);
      setQuick("");
      setComposerOpen(false);
      setEditing(null);
    };
    window.addEventListener("guardian:profile-changed", onProfile);
    return () =>
      window.removeEventListener("guardian:profile-changed", onProfile);
  }, []);

  const saveQuick = async (e: FormEvent) => {
    e.preventDefault();
    if (!quick.trim() || savingQuick) return;
    setSavingQuick(true);
    setError(null);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          content: quick.trim(),
          quick: true,
          logDate: todayLogDate(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save Quick Log.");
        return;
      }
      setQuick("");
      await load();
    } finally {
      setSavingQuick(false);
    }
  };

  const saveFull = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          content: content.trim(),
          title: title.trim() || null,
          category: category || "General",
          tags: tagList,
          logDate,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save Daily Log.");
        return;
      }
      setContent("");
      setTitle("");
      setTags("");
      setCategory("General");
      setLogDate(todayLogDate());
      setComposerOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/logs/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editing.content,
          title: editing.title,
          category: editing.category,
          logDate: editing.log_date,
          tags: editing.tags,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update Daily Log.");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (log: DailyLog) => {
    const ok = window.confirm(
      "Delete this Daily Log? This cannot be undone."
    );
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/logs/${log.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't delete Daily Log.");
      return;
    }
    await load();
  };

  const logMoveLabel = (log: DailyLog) =>
    log.title?.trim() ||
    (log.content.length > 48
      ? `${log.content.slice(0, 48).trim()}…`
      : log.content.trim()) ||
    "Daily Log";

  const grouped = useMemo(() => {
    const map = new Map<string, DailyLog[]>();
    for (const log of logs) {
      const list = map.get(log.log_date) ?? [];
      list.push(log);
      map.set(log.log_date, list);
    }
    return [...map.entries()];
  }, [logs]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{profileName}</h2>
            <p className="text-xs text-ink-muted">Daily Log</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setComposerOpen((o) => !o);
            setEditing(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Daily Log
        </button>
      </div>

      <form onSubmit={saveQuick} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="quick-log">
          Quick Log
        </label>
        <input
          id="quick-log"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="What happened today?"
          maxLength={8000}
          className="min-w-0 flex-1 rounded-full border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
        />
        <button
          type="submit"
          disabled={savingQuick || !quick.trim()}
          className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {savingQuick ? <Loader2 className="h-4 w-4 animate-spin" /> : "Quick Log"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search logs…"
            className="w-full rounded-full border border-stone-200 py-2 pl-8 pr-3 text-xs outline-none ring-brand focus:ring-2"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="rounded-full border border-stone-200 px-3 py-2 text-xs"
          aria-label="From date"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="rounded-full border border-stone-200 px-3 py-2 text-xs"
          aria-label="To date"
        />
      </div>

      {composerOpen && (
        <form
          onSubmit={saveFull}
          className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4"
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={4}
            placeholder="What happened?"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma-separated, optional)"
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !content.trim()}
              className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save log"}
            </button>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="rounded-full border border-stone-300 px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-5">
        {loading ? (
          <p className="text-xs text-ink-muted">Loading timeline…</p>
        ) : logs.length === 0 ? (
          <div className="rounded-xl bg-stone-50 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              Start your timeline.
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Add important updates, events, progress, or things you want Gideon
              to remember about this profile.
            </p>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Daily Log
            </button>
          </div>
        ) : (
          grouped.map(([date, dayLogs]) => (
            <section key={date}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {formatLogDayHeading(date)}
              </h3>
              <ul className="mt-2 space-y-2">
                {dayLogs.map((log) =>
                  editing?.id === log.id ? (
                    <li
                      key={log.id}
                      className="rounded-xl border border-brand/30 bg-brand-light/30 p-3"
                    >
                      <form onSubmit={saveEdit} className="space-y-2">
                        <textarea
                          value={editing.content}
                          onChange={(e) =>
                            setEditing({ ...editing, content: e.target.value })
                          }
                          rows={3}
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="date"
                            value={editing.log_date}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                log_date: e.target.value,
                              })
                            }
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs"
                          />
                          <select
                            value={editing.category ?? "General"}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                category: e.target.value,
                              })
                            }
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs"
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={log.id}
                      className="rounded-xl bg-stone-50 px-3 py-3"
                    >
                      {log.title && (
                        <p className="text-sm font-semibold">{log.title}</p>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                        {log.content}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                        {log.category && (
                          <span>Category: {log.category}</span>
                        )}
                        {log.tags?.length > 0 && (
                          <span>Tags: {log.tags.join(", ")}</span>
                        )}
                        <span className="ml-auto flex gap-1">
                          <MoveDailyLogButton
                            logId={log.id}
                            logLabel={logMoveLabel(log)}
                            currentProfileId={profileId}
                            onMoved={() => {
                              setLogs((prev) => prev.filter((l) => l.id !== log.id));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setEditing(log)}
                            aria-label="Edit log"
                            className="rounded-md p-1.5 hover:bg-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(log)}
                            aria-label="Delete log"
                            className="rounded-md p-1.5 text-red-600 hover:bg-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    </li>
                  )
                )}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
