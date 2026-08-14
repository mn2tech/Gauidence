"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Folder,
  HardDrive,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { AndroidStorageConnector } from "@/lib/connectors/android/AndroidStorageConnector";
import { ConnectorError, type ConnectedSource, type ScanResultSummary, type SourceItem } from "@/lib/connectors/types";
import { formatLastScanned } from "@/lib/connectors/services/sourceItems";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  findTrelloBoundProfile,
  TRELLO_PREFERRED_SPACE_NAME,
} from "@/lib/connectors/trello/boundSpace";
import {
  analyzeSourceItemClient,
  isItemNeedsAnalyze,
} from "@/lib/connectors/clientAnalyze";

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
  "Files remain on your device.",
  "Guardian currently stores only file metadata.",
  "Guardian will not upload or analyze files until you explicitly choose to do so.",
];

const DEVICE_STORAGE_LABEL = "Device Storage";

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
  const { profiles, active } = useActiveProfile();
  const trelloBoundProfile = useMemo(
    () => findTrelloBoundProfile(profiles, active),
    [profiles, active]
  );
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [summary, setSummary] = useState<ItemSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultSummary | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmTrelloDisconnect, setConfirmTrelloDisconnect] = useState(false);
  const [trelloModalOpen, setTrelloModalOpen] = useState(false);
  const [trelloApiKey, setTrelloApiKey] = useState("");
  const [trelloToken, setTrelloToken] = useState("");
  const [trelloSummary, setTrelloSummary] = useState<ItemSummary | null>(null);

  const phoneSource = useMemo(
    () => sources.find((s) => s.sourceType === "android_storage") ?? null,
    [sources]
  );
  const trelloSource = useMemo(
    () => sources.find((s) => s.sourceType === "trello") ?? null,
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
      const trello = list.find((s) => s.sourceType === "trello");
      if (trello && trello.status !== "disconnected") {
        const sumRes = await fetch(
          `/api/connections/${trello.id}/items?summary=1`
        );
        const sumBody = (await sumRes.json().catch(() => ({}))) as ItemSummary & {
          error?: string;
        };
        if (sumRes.ok) {
          setTrelloSummary(sumBody);
        } else {
          setTrelloSummary(null);
        }
      } else {
        setTrelloSummary(null);
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

  const connectPhone = useCallback(async (mode: "compatible" | "persistent" = "compatible") => {
    setBusy("connect");
    setError(null);
    setScanResult(null);
    const connector = new AndroidStorageConnector();
    try {
      const draft = await connector.connect({ mode });
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

  const analyzeTrelloAfterScan = useCallback(
    async (sourceId: string, profileId: string | null | undefined) => {
      const itemsRes = await fetch(`/api/connections/${sourceId}/items`);
      const itemsBody = (await itemsRes.json().catch(() => ({}))) as {
        items?: Array<SourceItem & { id: string }>;
        error?: string;
      };
      if (!itemsRes.ok || !itemsBody.items?.length) return { analyzed: 0, failed: 0 };

      const queue = itemsBody.items.filter((item) => {
        const kind = String(item.metadata?.kind ?? "");
        return kind === "board" || kind === "attachment";
      });

      // Boards are cheap text exports — refresh them. PDFs only when new/failed
      // so Scan Again doesn't re-download every chart.
      const boards = queue.filter((i) => i.metadata?.kind === "board");
      const pdfs = queue
        .filter(
          (i) =>
            i.metadata?.kind === "attachment" && isItemNeedsAnalyze(i)
        )
        .slice(0, 25);
      const ordered = [...boards, ...pdfs];

      let analyzed = 0;
      let failed = 0;
      for (const item of ordered) {
        const result = await analyzeSourceItemClient({
          sourceId,
          item,
          profileId: profileId ?? null,
          force: item.processingStatus === "analysis_failed",
          remote: true,
          allowUnchangedSkip: true,
        });
        if (result.ok) analyzed += 1;
        else if (!result.cancelled) failed += 1;
      }
      return { analyzed, failed };
    },
    []
  );

  const connectTrello = useCallback(async () => {
    setBusy("trello-connect");
    setError(null);
    setScanResult(null);
    try {
      if (!trelloBoundProfile) {
        throw new Error(
          "Create a space first, then connect Trello (it will bind to your active space)."
        );
      }
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "trello",
          apiKey: trelloApiKey.trim(),
          token: trelloToken.trim(),
          profileId: trelloBoundProfile.id,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        source?: ConnectedSource;
        error?: string;
      };
      if (!res.ok || !body.source) {
        throw new Error(body.error ?? "Couldn't connect Trello.");
      }
      const scanRes = await fetch(`/api/connections/${body.source.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const scanBody = (await scanRes.json().catch(() => ({}))) as {
        summary?: ScanResultSummary;
        error?: string;
        message?: string;
      };
      if (!scanRes.ok) {
        throw new Error(
          scanBody.message ?? scanBody.error ?? "Connected, but board scan failed."
        );
      }
      setScanResult(scanBody.summary ?? null);
      setBusy("trello-analyze");
      const analyzeStats = await analyzeTrelloAfterScan(
        body.source.id,
        trelloBoundProfile.id
      );
      setTrelloModalOpen(false);
      setTrelloApiKey("");
      setTrelloToken("");
      await load();
      if (analyzeStats.failed > 0 && analyzeStats.analyzed === 0) {
        setError(
          "Connected and scanned, but Analyze failed. Open Browse Boards & PDFs and Analyze again."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect Trello.");
    } finally {
      setBusy(null);
    }
  }, [analyzeTrelloAfterScan, load, trelloApiKey, trelloBoundProfile, trelloToken]);

  const bindTrelloToPreferredSpace = useCallback(async () => {
    if (!trelloSource || !trelloBoundProfile) return;
    setBusy("trello-bind");
    setError(null);
    try {
      const res = await fetch(`/api/connections/${trelloSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: trelloBoundProfile.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't bind Trello to that space.");
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't bind Trello to that space."
      );
    } finally {
      setBusy(null);
    }
  }, [load, trelloBoundProfile, trelloSource]);

  const scanTrelloAgain = useCallback(async () => {
    if (!trelloSource) return;
    setBusy("trello-scan");
    setError(null);
    setScanResult(null);
    try {
      const res = await fetch(`/api/connections/${trelloSource.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: ScanResultSummary;
        error?: string;
        message?: string;
      };
      if (res.status === 403 || body.error === "permission_revoked") {
        await load();
        throw new Error(
          body.message ?? "Trello access was revoked. Reconnect with a new token."
        );
      }
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't scan Trello boards.");
      }
      setScanResult(body.summary ?? null);
      setBusy("trello-analyze");
      await analyzeTrelloAfterScan(
        trelloSource.id,
        trelloSource.profileId ?? trelloBoundProfile?.id
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trello scan failed.");
    } finally {
      setBusy(null);
    }
  }, [analyzeTrelloAfterScan, load, trelloBoundProfile?.id, trelloSource]);

  const disconnectTrello = useCallback(async () => {
    if (!trelloSource) return;
    setBusy("trello-disconnect");
    setError(null);
    try {
      const res = await fetch(`/api/connections/${trelloSource.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't disconnect Trello.");
      }
      setConfirmTrelloDisconnect(false);
      setScanResult(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect Trello.");
    } finally {
      setBusy(null);
    }
  }, [load, trelloSource]);

  const folderName = String(
    phoneSource?.settings?.folderName ?? "Selected folder"
  );
  const phoneConnected =
    phoneSource?.status === "connected" || phoneSource?.status === "error";
  const permissionRevoked = phoneSource?.status === "permission_revoked";
  const trelloConnected =
    trelloSource?.status === "connected" || trelloSource?.status === "error";
  const trelloRevoked = trelloSource?.status === "permission_revoked";
  const trelloUsername = String(trelloSource?.settings?.username ?? "");
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

          {/* Device Storage */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
                <Folder className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  {DEVICE_STORAGE_LABEL}
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
                      onClick={() => void connectPhone("compatible")}
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
                        onClick={() => void connectPhone("compatible")}
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
                      Choose a folder on this device. Guardian stores metadata
                      only — files stay on your device.
                    </p>
                    <p className="mt-2 text-xs text-ink-muted">
                      Your browser may ask “Upload files to this site?” That
                      only lets Guardian read names and sizes in this session —
                      files are not saved to Guardian storage. Prefer a smaller
                      folder (for example a subfolder of Downloads) when you can.
                    </p>
                    <p className="mt-2 text-xs text-ink-muted">
                      Tip: Chrome blocks Downloads, Documents, Desktop, and
                      Pictures in its persistent folder picker. Compatible
                      Connect works with those folders; or create
                      Downloads/Guardian and use persistent access.
                    </p>
                    <button
                      type="button"
                      onClick={() => void connectPhone("compatible")}
                      disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {busy === "connect" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        "Connect Device Storage"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void connectPhone("persistent")}
                      disabled={busy !== null}
                      className="mt-2 block text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
                    >
                      Or use persistent folder access (custom subfolders)
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Trello */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  Trello
                </h2>

                {trelloRevoked ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      Access Required
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Trello rejected the saved token. Connect again with a fresh
                      token.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTrelloModalOpen(true)}
                      disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      Reconnect Trello
                    </button>
                  </>
                ) : trelloConnected && trelloSource ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="ok" />
                      Connected
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Account</dt>
                        <dd className="font-medium text-foreground">
                          {trelloUsername
                            ? `@${trelloUsername}`
                            : trelloSource.displayName ?? "Trello"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Bound space</dt>
                        <dd className="font-medium text-foreground">
                          {trelloSource.profileId &&
                          trelloBoundProfile &&
                          trelloSource.profileId === trelloBoundProfile.id
                            ? trelloBoundProfile.display_name
                            : trelloSource.profileId
                              ? profiles.find(
                                  (p) => p.id === trelloSource.profileId
                                )?.display_name ?? "Another space"
                              : "Not bound to a space"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Boards discovered</dt>
                        <dd className="font-medium text-foreground">
                          {trelloSummary?.total ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Last scanned</dt>
                        <dd className="font-medium text-foreground">
                          {formatLastScanned(
                            trelloSummary?.lastScanAt ?? trelloSource.lastScanAt
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {trelloBoundProfile &&
                      trelloSource.profileId !== trelloBoundProfile.id ? (
                        <button
                          type="button"
                          onClick={() => void bindTrelloToPreferredSpace()}
                          disabled={busy !== null}
                          className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                        >
                          {busy === "trello-bind" ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Binding…
                            </>
                          ) : (
                            `Bind to ${trelloBoundProfile.display_name}`
                          )}
                        </button>
                      ) : null}
                      <Link
                        href={`/settings/connections/${trelloSource.id}`}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                      >
                        Browse Boards & PDFs
                      </Link>
                      <button
                        type="button"
                        onClick={() => void scanTrelloAgain()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        {busy === "trello-scan" || busy === "trello-analyze" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {busy === "trello-analyze"
                              ? "Analyzing…"
                              : "Scanning…"}
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
                        onClick={() => setTrelloModalOpen(true)}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        Update credentials
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTrelloDisconnect(true)}
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
                      Connect with your Trello API key and token. Boards and PDF
                      chord charts analyze into{" "}
                      <span className="font-medium text-foreground">
                        {trelloBoundProfile?.display_name ??
                          "your active space"}
                      </span>
                      so Gideon can answer from them like files in that space.
                    </p>
                    {!trelloBoundProfile ? (
                      <p className="mt-2 text-sm text-amber-800">
                        Create a space first, then connect Trello.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setTrelloModalOpen(true)}
                      disabled={busy !== null || !trelloBoundProfile}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      Connect Trello
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
              Disconnect Device Storage?
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

      {confirmTrelloDisconnect ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trello-disconnect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="trello-disconnect-title"
              className="text-lg font-semibold text-foreground"
            >
              Disconnect Trello?
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Guardian will stop syncing boards. Saved credentials are removed
              from this connection.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTrelloDisconnect(false)}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void disconnectTrello()}
                disabled={busy !== null}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "trello-disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {trelloModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trello-connect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="trello-connect-title"
              className="text-lg font-semibold text-foreground"
            >
              Connect Trello
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Paste your Power-Up API key and user token. Boards analyze into{" "}
              <span className="font-medium text-foreground">
                {trelloBoundProfile?.display_name ?? "your active space"}
              </span>
              .
            </p>
            <label className="mt-4 block text-sm font-medium text-foreground">
              API key
              <input
                type="password"
                autoComplete="off"
                value={trelloApiKey}
                onChange={(e) => setTrelloApiKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                placeholder="From Power-Up → API key"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-foreground">
              Token
              <input
                type="password"
                autoComplete="off"
                value={trelloToken}
                onChange={(e) => setTrelloToken(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                placeholder="From the Token authorize page"
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTrelloModalOpen(false);
                  setTrelloApiKey("");
                  setTrelloToken("");
                }}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void connectTrello()}
                disabled={
                  busy !== null ||
                  !trelloApiKey.trim() ||
                  !trelloToken.trim()
                }
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy === "trello-connect" || busy === "trello-analyze" ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    {busy === "trello-analyze"
                      ? "Analyzing boards…"
                      : "Connecting…"}
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
