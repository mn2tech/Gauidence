"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, HardDrive, Loader2 } from "lucide-react";
import { formatStorageBytes, formatStorageSummary } from "@/lib/billing/storageFormat";

type StoragePayload = {
  totalBytes: number;
  fileBytes: number;
  fileCount: number;
  imageBytes: number;
  imageCount: number;
  limitBytes: number;
  remainingBytes: number;
  percentUsed: number;
  planLabel: string;
};

function UsageBar({ percent }: { percent: number }) {
  const pct = Math.min(100, Math.max(0, percent));
  const tone =
    pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-foreground";
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
      <div
        className={`h-full rounded-full transition-[width] ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StorageRow({
  title,
  summary,
  href,
}: {
  title: string;
  summary: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 transition hover:bg-stone-50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{summary}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
    </Link>
  );
}

export default function StorageSection() {
  const [data, setData] = useState<StoragePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/storage");
      const body = (await res.json().catch(() => ({}))) as StoragePayload & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load storage usage.");
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setError("Couldn't load storage usage.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      id="storage"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
          <HardDrive className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Storage</h2>
          {loading ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading vault storage…
            </p>
          ) : error ? (
            <p className="mt-2 text-sm text-red-700">{error}</p>
          ) : data ? (
            <>
              <p className="mt-2 text-sm font-medium text-foreground">
                {formatStorageBytes(data.totalBytes)} of{" "}
                {formatStorageBytes(data.limitBytes)} used
              </p>
              <UsageBar percent={data.percentUsed} />
              {data.percentUsed >= 95 ? (
                <p className="mt-2 text-xs text-red-700">
                  Storage is almost full. Delete files from your vault or{" "}
                  <Link
                    href="/settings#billing"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    upgrade your plan
                  </Link>
                  .
                </p>
              ) : null}
              <div className="mt-5">
                <p className="text-sm font-semibold text-foreground">
                  Manage storage
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Review files in your vault to free up space on the {data.planLabel}{" "}
                  plan.
                </p>
                <div className="mt-3 space-y-2">
                  <StorageRow
                    title="Files"
                    summary={formatStorageSummary(
                      data.fileBytes,
                      data.fileCount,
                      data.fileCount === 1 ? "file" : "files"
                    )}
                    href="/dashboard"
                  />
                  <StorageRow
                    title="Images"
                    summary={formatStorageSummary(
                      data.imageBytes,
                      data.imageCount,
                      data.imageCount === 1 ? "image" : "images"
                    )}
                    href="/dashboard"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
