"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { classifyFileType } from "@/lib/connectors/classify";
import { isSourceItemAnalyzeEnabled } from "@/lib/connectors/features";
import type { ConnectedSource, SourceItem } from "@/lib/connectors/types";
import {
  formatBytes,
  formatModified,
} from "@/lib/connectors/services/sourceItems";

type Props = {
  sourceId: string;
  itemId: string;
};

export default function SourceFileDetail({ sourceId, itemId }: Props) {
  const [item, setItem] = useState<(SourceItem & { id: string }) | null>(null);
  const [source, setSource] = useState<ConnectedSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const analyzeEnabled = isSourceItemAnalyzeEnabled();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/connections/${sourceId}/items/${itemId}`
        );
        const body = (await res.json().catch(() => ({}))) as {
          item?: SourceItem & { id: string };
          source?: ConnectedSource;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.item) {
          setError(body.error ?? "Couldn't load file details.");
          return;
        }
        setItem(body.item);
        setSource(body.source ?? null);
      } catch {
        if (!cancelled) {
          setError("Network unavailable. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, sourceId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </p>
    );
  }

  if (error || !item) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error ?? "File not found."}
      </p>
    );
  }

  const folder =
    (item.metadata?.parentFolder as string | undefined) ||
    String(source?.settings?.folderName ?? "—");
  const type = classifyFileType(item.name, item.mimeType);

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link
          href={`/settings/connections/${sourceId}`}
          className="text-brand hover:text-brand-dark"
        >
          ← Browse Files
        </Link>
      </p>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {item.name}
        </h1>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-ink-muted">Source</dt>
            <dd className="font-medium text-foreground">Phone Storage</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-ink-muted">Folder</dt>
            <dd className="font-medium text-foreground">{folder}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-ink-muted">Type</dt>
            <dd className="font-medium text-foreground">{type}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-ink-muted">Size</dt>
            <dd className="font-medium text-foreground">
              {formatBytes(item.sizeBytes)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-ink-muted">Modified</dt>
            <dd className="font-medium text-foreground">
              {formatModified(item.modifiedAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Status</dt>
            <dd className="font-medium capitalize text-foreground">
              {item.processingStatus}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          {analyzeEnabled ? (
            <button
              type="button"
              disabled
              title="Coming in a later release"
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white opacity-50"
            >
              Analyze with Guardian
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="hidden rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              aria-hidden
            >
              Analyze with Guardian
            </button>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Content preview and analysis are not available yet. Guardian stores
            metadata only.
          </p>
        </div>
      </section>
    </div>
  );
}
