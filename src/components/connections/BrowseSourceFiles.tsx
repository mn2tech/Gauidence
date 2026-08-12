"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { classifyFileType } from "@/lib/connectors/classify";
import type { FileTypeCategory } from "@/lib/connectors/types";
import type { SourceItem } from "@/lib/connectors/types";
import {
  formatBytes,
  formatModified,
} from "@/lib/connectors/services/sourceItems";

const FILTERS: Array<"All" | FileTypeCategory> = [
  "All",
  "Images",
  "PDF",
  "Documents",
  "Spreadsheets",
  "Other",
];

type StatusFilter = "available" | "unavailable" | "all";

type Props = {
  sourceId: string;
};

export default function BrowseSourceFiles({ sourceId }: Props) {
  const [items, setItems] = useState<Array<SourceItem & { id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof FILTERS)[number]>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("available");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(
        `/api/connections/${sourceId}/items?${params.toString()}`
      );
      const body = (await res.json().catch(() => ({}))) as {
        items?: Array<SourceItem & { id: string }>;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load files.");
        setItems([]);
        return;
      }
      setItems(body.items ?? []);
    } catch {
      setError("Network unavailable. Check your connection and try again.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unavailableCount = useMemo(
    () => items.filter((i) => i.processingStatus === "unavailable").length,
    [items]
  );

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter === "available") {
      list = list.filter((i) => i.processingStatus !== "unavailable");
    } else if (statusFilter === "unavailable") {
      list = list.filter((i) => i.processingStatus === "unavailable");
    }
    if (category === "All") return list;
    return list.filter((item) => {
      const cat = classifyFileType(item.name, item.mimeType);
      if (category === "Other") return cat === "Other" || cat === "Text";
      return cat === category;
    });
  }, [category, items, statusFilter]);

  const clearUnavailable = useCallback(async () => {
    if (unavailableCount === 0) return;
    const ok = window.confirm(
      `Remove ${unavailableCount} unavailable file record(s) from Guardian?\n\nThis only clears metadata. Nothing on your device is deleted.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/connections/${sourceId}/items?scope=unavailable`,
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        deleted?: number;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't clear unavailable files.");
        return;
      }
      await load();
    } catch {
      setError("Couldn't clear unavailable files.");
    } finally {
      setBusy(false);
    }
  }, [load, sourceId, unavailableCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search by filename</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename"
            className="w-full rounded-full border border-stone-200 bg-white py-2 pl-9 pr-4 text-sm outline-none ring-brand focus:ring-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["available", "Available"],
            ["unavailable", `Unavailable${unavailableCount ? ` (${unavailableCount})` : ""}`],
            ["all", "All statuses"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === value
                ? "bg-brand text-white"
                : "border border-stone-200 bg-white text-ink-muted hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setCategory(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              category === f
                ? "bg-brand text-white"
                : "border border-stone-200 bg-white text-ink-muted hover:bg-stone-50"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {unavailableCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <p>
            {unavailableCount} unavailable record
            {unavailableCount === 1 ? "" : "s"} from earlier scans. Go to
            Connections and press <span className="font-medium">Scan Again</span>{" "}
            on this folder to refresh available files.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void clearUnavailable()}
            className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
          >
            {busy ? "Clearing…" : "Clear unavailable"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files…
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted shadow-sm">
          {statusFilter === "available"
            ? "No available files yet. Go back to Connections and press Scan Again, then choose the January folder."
            : "No files match this filter."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Modified</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {filtered.map((item) => {
              const type = classifyFileType(item.name, item.mimeType);
              return (
                <li key={item.id}>
                  <Link
                    href={`/settings/connections/${sourceId}/files/${item.id}`}
                    className="grid gap-1 px-4 py-3 transition hover:bg-stone-50 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] sm:items-center sm:gap-2"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="text-sm text-ink-muted">{type}</span>
                    <span className="text-sm text-ink-muted">
                      {formatBytes(item.sizeBytes)}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {formatModified(item.modifiedAt)}
                    </span>
                    <span className="text-sm capitalize text-ink-muted">
                      {item.processingStatus.replace(/_/g, " ")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
