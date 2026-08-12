"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Folder, Loader2 } from "lucide-react";
import type { ConnectedSource } from "@/lib/connectors/types";
import { formatLastScanned } from "@/lib/connectors/services/sourceItems";

type Props = {
  onNavigate?: () => void;
};

type Summary = {
  total: number;
  unavailable: number;
};

/**
 * Light Connected sources panel for Ask Gideon sidebar.
 */
export default function AskConnectedSourcesPanel({ onNavigate }: Props) {
  const [source, setSource] = useState<ConnectedSource | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connections");
      const body = (await res.json().catch(() => ({}))) as {
        sources?: ConnectedSource[];
      };
      if (!res.ok) {
        setSource(null);
        setSummary(null);
        return;
      }
      const phone =
        (body.sources ?? []).find(
          (s) =>
            s.sourceType === "android_storage" &&
            s.status !== "disconnected"
        ) ?? null;
      setSource(phone);
      if (phone && phone.status === "connected") {
        const sumRes = await fetch(
          `/api/connections/${phone.id}/items?summary=1`
        );
        const sumBody = (await sumRes.json().catch(() => ({}))) as Summary;
        if (sumRes.ok) setSummary(sumBody);
        else setSummary(null);
      } else {
        setSummary(null);
      }
    } catch {
      setSource(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const folderName = String(source?.settings?.folderName ?? "Folder");
  const connected = source?.status === "connected";
  const revoked = source?.status === "permission_revoked";

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
          <Folder className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">Device Storage</p>
          {loading ? (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking…
            </p>
          ) : connected && source ? (
            <>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                {folderName}
                {summary ? ` · ${summary.total} files` : ""}
              </p>
              <p className="truncate text-[10px] text-ink-muted">
                Last scan {formatLastScanned(source.lastScanAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Link
                  href={`/settings/connections/${source.id}`}
                  onClick={() => onNavigate?.()}
                  className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-stone-50"
                >
                  Browse
                </Link>
                <Link
                  href={`/settings/connections/${source.id}`}
                  onClick={() => onNavigate?.()}
                  className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-stone-50"
                >
                  Analyze files
                </Link>
                <Link
                  href="/settings/connections"
                  onClick={() => onNavigate?.()}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-brand hover:text-brand-dark"
                >
                  Manage
                </Link>
              </div>
            </>
          ) : revoked && source ? (
            <>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Access required
              </p>
              <Link
                href="/settings/connections"
                onClick={() => onNavigate?.()}
                className="mt-2 inline-flex rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-brand-dark"
              >
                Reconnect
              </Link>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Not connected. Link a folder to analyze without copying files.
              </p>
              <Link
                href="/settings/connections"
                onClick={() => onNavigate?.()}
                className="mt-2 inline-flex rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-brand-dark"
              >
                Connect
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
