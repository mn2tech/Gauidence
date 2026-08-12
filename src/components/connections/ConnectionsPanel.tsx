"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  HardDrive,
  Loader2,
  Phone,
  RefreshCw,
  Shield,
} from "lucide-react";
import { AndroidStorageConnector } from "@/lib/connectors/android/AndroidStorageConnector";
import { ConnectorError, type ConnectedSource, type ScanResultSummary } from "@/lib/connectors/types";
import { formatLastScanned } from "@/lib/connectors/services/sourceItems";

type CategoryCounts = {
  Images: number;
  PDF: number;
  Documents: number;
  Spreadsheets: number;
  Text: number;
  Other: number;
};

type ItemSummary = {
  total: number;
  unavailable: number;
  categories: CategoryCounts;
  lastScanAt: string | null;
};

const PRIVACY_LINES = [
  "Guardian only accesses folders you choose.",
  "Files remain on your phone.",
  "Guardian currently stores only file metadata.",
  "Guardian will not upload or analyze files until you explicitly choose to do so.",
];

function StatusDot({
  tone,
}: {
  tone: "ok" | "off" | "warn" | "soon";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "soon"
          ? "bg-stone-300"
          : "bg-stone-400";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${cls}`}
      aria-hidden
    />
  );
}

export default function ConnectionsPanel() {
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [summary, setSummary] = useState<ItemSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultSummary | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const phoneSource = useMemo(
    () => sources.find((s) => s.sourceType === "android_storage") ?? null,
    [sources]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connections");
      const body = (await res.json().catch(() => ({}))) as {
        sources?: ConnectedSource[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load connections.");
        setSources([]);
        return;
      }
      const list = body.sources ?? [];
      setSources(list);
      const phone = list.find((s) => s.sourceType === "android_storage");
      if (phone && phone.status !== "disconnected") {
        const sumRes = await fetch(
          `/api/connections/${phone.id}/items?summary=1`
        );
        const sumBody = (await sumRes.json().catch(() => ({}))) as ItemSummary & {
          error?: string;
        };
        if (sumRes.ok) {
          setSummary(sumBody);
        } else {
          setSummary(null);
        }
      } else {
        setSummary(null);
      }
    } catch {
      setError("Network unavailable. Check your connection and try again.");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runScan = useCallback(
    async (source: ConnectedSource, connector: AndroidStorageConnector) => {
      const items = await connector.scan(source);
      const res = await fetch(`/api/connections/${source.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: ScanResultSummary;
        error?: string;
        message?: string;
      };
      if (res.status === 403 || body.error === "permission_revoked") {
        await fetch(`/api/connections/${source.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "permission_revoked" }),
        });
        throw new ConnectorError(
          "permission_revoked",
          body.message ?? "Guardian no longer has access to this folder."
        );
      }
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't save scan results.");
      }
      return body.summary ?? null;
    },
    []
  );

  const connectPhone = useCallback(async () => {
    setBusy("connect");
    setError(null);
    setScanResult(null);
    const connector = new AndroidStorageConnector();
    try {
      const draft = await connector.connect();
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "android_storage",
          displayName: draft.displayName,
          sourceUri: draft.sourceUri,
          settings: draft.settings,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        source?: ConnectedSource;
        error?: string;
      };
      if (!res.ok || !body.source) {
        throw new Error(body.error ?? "Couldn't save connection.");
      }
      await connector.bindPendingPermission(body.source.id);
      const summaryResult = await runScan(body.source, connector);
      setScanResult(summaryResult);
      await load();
    } catch (err) {
      if (err instanceof ConnectorError && err.code === "cancelled") {
        setError(null);
      } else if (err instanceof ConnectorError) {
        setError(err.message);
        await load();
      } else {
        setError(
          err instanceof Error ? err.message : "Couldn't connect phone storage."
        );
      }
    } finally {
      setBusy(null);
    }
  }, [load, runScan]);

  const scanAgain = useCallback(async () => {
    if (!phoneSource) return;
    setBusy("scan");
    setError(null);
    setScanResult(null);
    const connector = new AndroidStorageConnector();
    try {
      const summaryResult = await runScan(phoneSource, connector);
      setScanResult(summaryResult);
      await load();
    } catch (err) {
      if (err instanceof ConnectorError && err.code === "permission_revoked") {
        setError(err.message);
        await load();
      } else if (err instanceof ConnectorError && err.code === "cancelled") {
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Scan failed.");
      }
    } finally {
      setBusy(null);
    }
  }, [load, phoneSource, runScan]);

  const disconnect = useCallback(async () => {
    if (!phoneSource) return;
    setBusy("disconnect");
    setError(null);
    const connector = new AndroidStorageConnector();
    try {
      await connector.disconnect(phoneSource);
      const res = await fetch(`/api/connections/${phoneSource.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't disconnect.");
      }
      setConfirmDisconnect(false);
      setScanResult(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
    }
  }, [load, phoneSource]);

  const folderName = String(
    phoneSource?.settings?.folderName ?? "Selected folder"
  );
  const phoneConnected =
    phoneSource?.status === "connected" || phoneSource?.status === "error";
  const permissionRevoked = phoneSource?.status === "permission_revoked";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
            <Shield className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Privacy</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
              {PRIVACY_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {scanResult ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Scan complete — {scanResult.newCount} new, {scanResult.updatedCount}{" "}
          updated, {scanResult.unavailableCount} unavailable
          {scanResult.unchangedCount
            ? `, ${scanResult.unchangedCount} unchanged`
            : ""}
          .
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading connections…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Guardian built-in */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
                <HardDrive className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  Guardian
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                  <StatusDot tone="ok" />
                  Connected
                </p>
                <p className="mt-2 text-sm text-ink-muted">
                  Your Guardian vault and spaces on this account.
                </p>
              </div>
            </div>
          </section>

          {/* Phone Storage */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
                <Phone className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  Phone Storage
                </h2>

                {permissionRevoked ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      Access Required
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Guardian no longer has access to this folder.
                    </p>
                    <button
                      type="button"
                      onClick={() => void connectPhone()}
                      disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {busy === "connect" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Reconnecting…
                        </>
                      ) : (
                        "Reconnect"
                      )}
                    </button>
                  </>
                ) : phoneConnected && phoneSource ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="ok" />
                      Connected
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Folder</dt>
                        <dd className="font-medium text-foreground">
                          {folderName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Files discovered</dt>
                        <dd className="font-medium text-foreground">
                          {summary?.total ?? "—"}
                        </dd>
                      </div>
                      {summary ? (
                        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          {(
                            [
                              "Images",
                              "PDF",
                              "Documents",
                              "Spreadsheets",
                              "Other",
                            ] as const
                          ).map((key) => (
                            <div
                              key={key}
                              className="flex justify-between gap-2"
                            >
                              <span className="text-ink-muted">
                                {key === "PDF" ? "PDFs" : key}
                              </span>
                              <span className="font-medium text-foreground">
                                {(summary.categories[key] ?? 0) +
                                  (key === "Other"
                                    ? summary.categories.Text ?? 0
                                    : 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 flex justify-between gap-4">
                        <dt className="text-ink-muted">Last scanned</dt>
                        <dd className="font-medium text-foreground">
                          {formatLastScanned(
                            summary?.lastScanAt ?? phoneSource.lastScanAt
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={`/settings/connections/${phoneSource.id}`}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                      >
                        Browse Files
                      </Link>
                      <button
                        type="button"
                        onClick={() => void scanAgain()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        {busy === "scan" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Scanning…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                            Scan Again
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void connectPhone()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        Manage Access
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(true)}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="off" />
                      Not Connected
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Choose a folder on your device. Guardian stores metadata
                      only — files stay on your phone.
                    </p>
                    <button
                      type="button"
                      onClick={() => void connectPhone()}
                      disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {busy === "connect" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        "Connect Phone Storage"
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Coming soon */}
          {[
            { name: "Google Drive", soon: true },
            { name: "Microsoft 365", soon: true },
          ].map((card) => (
            <section
              key={card.name}
              className="rounded-2xl border border-stone-200 bg-white p-6 opacity-80 shadow-sm"
            >
              <h2 className="text-base font-semibold text-foreground">
                {card.name}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                <StatusDot tone="soon" />
                Coming Soon
              </p>
            </section>
          ))}
        </div>
      )}

      {confirmDisconnect ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="disconnect-title"
              className="text-lg font-semibold text-foreground"
            >
              Disconnect Phone Storage?
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Guardian will stop accessing this folder.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Previously discovered metadata can remain in Guardian unless you
              delete it separately.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy !== null}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
