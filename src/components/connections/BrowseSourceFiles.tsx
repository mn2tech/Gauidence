"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, Search, Sparkles, XCircle } from "lucide-react";
import { classifyFileType } from "@/lib/connectors/classify";
import type { FileTypeCategory } from "@/lib/connectors/types";
import type { SourceItem } from "@/lib/connectors/types";
import {
  formatBytes,
  formatModified,
} from "@/lib/connectors/services/sourceItems";
import { isSourceItemAnalyzeEnabled } from "@/lib/connectors/features";
import {
  analyzeSourceItemClient,
  isItemAnalyzable,
  isItemNeedsAnalyze,
} from "@/lib/connectors/clientAnalyze";
import { ensureBatchReadAccess } from "@/lib/connectors/content/readClient";
import { ConnectorError } from "@/lib/connectors/types";

const FILTERS: Array<"All" | FileTypeCategory> = [
  "All",
  "Images",
  "PDF",
  "Documents",
  "Spreadsheets",
  "Other",
];

type StatusFilter = "available" | "unavailable" | "all";

type BatchRow = {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  detail?: string;
};

type Props = {
  sourceId: string;
};

export default function BrowseSourceFiles({ sourceId }: Props) {
  const analyzeEnabled = isSourceItemAnalyzeEnabled();
  const [items, setItems] = useState<Array<SourceItem & { id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof FILTERS)[number]>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("available");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchResults, setBatchResults] = useState<BatchRow[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);

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

  const selectedAnalyzable = useMemo(
    () => filtered.filter((i) => selected.has(i.id) && isItemAnalyzable(i)),
    [filtered, selected]
  );

  const needsAnalyzeCount = useMemo(
    () => filtered.filter(isItemNeedsAnalyze).length,
    [filtered]
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const item of filtered) {
          if (!isItemAnalyzable(item)) continue;
          if (checked) next.add(item.id);
          else next.delete(item.id);
        }
        return next;
      });
    },
    [filtered]
  );

  const allVisibleSelected =
    filtered.filter(isItemAnalyzable).length > 0 &&
    filtered.filter(isItemAnalyzable).every((i) => selected.has(i.id));

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

  const runBatch = useCallback(
    async (queue: Array<SourceItem & { id: string }>) => {
      if (!queue.length || batchBusy) return;
      setBatchBusy(true);
      setError(null);
      setBatchIndex(0);
      const initial: BatchRow[] = queue.map((item) => ({
        id: item.id,
        name: item.name,
        status: "pending",
      }));
      setBatchResults(initial);
      const outcome = [...initial];

      let access;
      try {
        access = await ensureBatchReadAccess(sourceId);
      } catch (err) {
        if (err instanceof ConnectorError && err.code === "cancelled") {
          setBatchResults([]);
          setBatchBusy(false);
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't open the connected folder."
        );
        setBatchBusy(false);
        return;
      }

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]!;
        setBatchIndex(i);
        outcome[i] = { ...outcome[i]!, status: "running" };
        setBatchResults([...outcome]);

        // Optimistically mark analyzing in the table.
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? { ...row, processingStatus: "analyzing" as const }
              : row
          )
        );

        const result = await analyzeSourceItemClient({
          sourceId,
          item,
          force:
            item.processingStatus === "analyzed" ||
            item.processingStatus === "analysis_failed",
          readOptions: {
            directoryHandle: access.directoryHandle,
            fileIndex: access.fileIndex,
            allowSingleFileFallback: false,
          },
        });

        if (result.ok) {
          outcome[i] = {
            ...outcome[i]!,
            status: result.skipped ? "skipped" : "success",
            detail: result.skipped
              ? "Unchanged — already analyzed"
              : result.entitiesFound != null
                ? `${result.entitiesFound} entities · ${result.relationshipsFound ?? 0} links`
                : undefined,
          };
          setItems((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? { ...row, processingStatus: "analyzed" as const }
                : row
            )
          );
        } else {
          if (result.cancelled) {
            outcome[i] = {
              ...outcome[i]!,
              status: "failed",
              detail: "Cancelled",
            };
            setBatchResults([...outcome]);
            break;
          }
          outcome[i] = {
            ...outcome[i]!,
            status: "failed",
            detail: result.error,
          };
          setItems((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    processingStatus:
                      item.processingStatus === "analyzed"
                        ? ("analyzed" as const)
                        : ("analysis_failed" as const),
                  }
                : row
            )
          );
        }
        setBatchResults([...outcome]);
      }

      setSelected(new Set());
      setBatchBusy(false);
      await load();
    },
    [batchBusy, load, sourceId]
  );

  const analyzeSelected = useCallback(() => {
    void runBatch(selectedAnalyzable);
  }, [runBatch, selectedAnalyzable]);

  const analyzeNew = useCallback(() => {
    const queue = filtered.filter(isItemNeedsAnalyze);
    void runBatch(queue);
  }, [filtered, runBatch]);

  const doneCount = batchResults.filter(
    (r) =>
      r.status === "success" ||
      r.status === "failed" ||
      r.status === "skipped"
  ).length;
  const successCount = batchResults.filter(
    (r) => r.status === "success" || r.status === "skipped"
  ).length;
  const failCount = batchResults.filter((r) => r.status === "failed").length;
  const progressPct =
    batchResults.length > 0
      ? Math.round((doneCount / batchResults.length) * 100)
      : 0;
  const currentName =
    batchResults[batchIndex]?.name ??
    (batchBusy ? "Starting…" : null);

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

      {analyzeEnabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={batchBusy || selectedAnalyzable.length === 0}
            onClick={analyzeSelected}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Analyze selected
            {selectedAnalyzable.length
              ? ` (${selectedAnalyzable.length})`
              : ""}
          </button>
          <button
            type="button"
            disabled={batchBusy || needsAnalyzeCount === 0}
            onClick={analyzeNew}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-stone-50 disabled:opacity-50"
          >
            Analyze new
            {needsAnalyzeCount ? ` (${needsAnalyzeCount})` : ""}
          </button>
          <p className="text-xs text-ink-muted">
            PDF, images, text, CSV, and Excel. Files stay on your device.
          </p>
        </div>
      ) : null}

      {batchResults.length > 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {batchBusy
                ? `Analyzing ${batchIndex + 1} of ${batchResults.length}`
                : `Finished ${successCount} ok · ${failCount} failed`}
            </p>
            {currentName && batchBusy ? (
              <p className="truncate text-xs text-ink-muted">{currentName}</p>
            ) : null}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-sm">
            {batchResults.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2 text-ink-muted"
              >
                {row.status === "running" || row.status === "pending" ? (
                  <Loader2
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      row.status === "running" ? "animate-spin text-brand" : ""
                    }`}
                  />
                ) : row.status === "failed" ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                ) : (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{row.name}</span>
                  {row.detail ? (
                    <span className="block text-xs">{row.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
            disabled={busy || batchBusy}
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
          <div className="hidden grid-cols-[auto_minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid">
            <span className="flex items-center">
              {analyzeEnabled ? (
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={batchBusy}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  aria-label="Select all analyzable files"
                  className="h-4 w-4 rounded border-stone-300"
                />
              ) : null}
            </span>
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>Modified</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {filtered.map((item) => {
              const type = classifyFileType(item.name, item.mimeType);
              const analyzable = isItemAnalyzable(item);
              return (
                <li
                  key={item.id}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,2fr)_1fr_1fr_1fr_1fr] sm:items-center sm:gap-2"
                >
                  <div className="flex items-center">
                    {analyzeEnabled ? (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        disabled={!analyzable || batchBusy}
                        onChange={(e) =>
                          toggleOne(item.id, e.target.checked)
                        }
                        aria-label={`Select ${item.name}`}
                        className="h-4 w-4 rounded border-stone-300 disabled:opacity-40"
                      />
                    ) : null}
                  </div>
                  <Link
                    href={`/settings/connections/${sourceId}/files/${item.id}`}
                    className="truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {item.name}
                  </Link>
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
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
