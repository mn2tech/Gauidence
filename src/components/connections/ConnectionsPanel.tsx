"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Cloud,
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
  itemBelongsToTrelloBoard,
  trelloSelectedBoardId,
  trelloSelectedBoardName,
} from "@/lib/connectors/trello/selectedBoard";
import {
  googleDriveSelectedFolderName,
} from "@/lib/connectors/googleDrive/selectedFolder";
import {
  analyzeSourceItemClient,
  isItemNeedsAnalyze,
} from "@/lib/connectors/clientAnalyze";
import { connectorAnalysisVersion } from "@/lib/ontology/pipeline/analysisVersion";
import { pickUniqueChartsForAnalyze } from "@/lib/connectors/trello/attachments";

const TRELLO_CHART_BATCH = 12;
const TRELLO_CHART_CONCURRENCY = 3;
/** Safety cap so a stuck queue cannot loop forever (~12k charts). */
const TRELLO_CHART_MAX_PASSES = 1000;

function chartAnalyzePriority(item: SourceItem): number {
  const name = item.name ?? "";
  let score = 0;
  if (/\s[-–—]\s*[A-G]/i.test(name)) score += 8;
  if (/\.pdf$/i.test(name)) score += 5;
  if (/\b(chord|chart)/i.test(name)) score += 4;
  if (item.processingStatus === "discovered") score += 3;
  if (item.processingStatus === "analyzing") score += 2;
  return score;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index]!);
      }
    })
  );
}

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
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);
  const [trelloNote, setTrelloNote] = useState<string | null>(null);
  const [trelloBoards, setTrelloBoards] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [trelloBoardId, setTrelloBoardId] = useState("");
  const [trelloModalStep, setTrelloModalStep] = useState<"creds" | "board">(
    "creds"
  );
  const [pendingTrelloSourceId, setPendingTrelloSourceId] = useState<string | null>(
    null
  );
  const [driveSummary, setDriveSummary] = useState<ItemSummary | null>(null);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveModalStep, setDriveModalStep] = useState<"space" | "folder">(
    "space"
  );
  const [driveProfileId, setDriveProfileId] = useState("");
  const [driveLocations, setDriveLocations] = useState<
    Array<{ id: string; name: string; kind: string; driveId?: string | null }>
  >([]);
  const [driveFolders, setDriveFolders] = useState<
    Array<{ id: string; name: string; kind: string; driveId?: string | null }>
  >([]);
  const [driveFolderId, setDriveFolderId] = useState("root");
  const [driveParentId, setDriveParentId] = useState("root");
  const [driveParentDriveId, setDriveParentDriveId] = useState<string | null>(
    null
  );
  const [driveNote, setDriveNote] = useState<string | null>(null);
  const [confirmDriveDisconnect, setConfirmDriveDisconnect] = useState(false);
  const [drivePickerPending, setDrivePickerPending] = useState(false);

  const phoneSource = useMemo(
    () => sources.find((s) => s.sourceType === "android_storage") ?? null,
    [sources]
  );
  const trelloSource = useMemo(() => {
    const trello = sources.filter(
      (s) => s.sourceType === "trello" && s.status !== "disconnected"
    );
    if (!trello.length) return null;
    const forActive = trello.find((s) => s.profileId === active?.id);
    return forActive ?? trello[0] ?? null;
  }, [sources, active?.id]);
  const driveSource = useMemo(() => {
    const drive = sources.filter(
      (s) => s.sourceType === "google_drive" && s.status !== "disconnected"
    );
    if (!drive.length) return null;
    const forActive = drive.find((s) => s.profileId === active?.id);
    return forActive ?? drive[0] ?? null;
  }, [sources, active?.id]);

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
      const drive = list.find((s) => s.sourceType === "google_drive");
      if (drive && drive.status !== "disconnected") {
        const sumRes = await fetch(
          `/api/connections/${drive.id}/items?summary=1`
        );
        const sumBody = (await sumRes.json().catch(() => ({}))) as ItemSummary & {
          error?: string;
        };
        if (sumRes.ok) {
          setDriveSummary(sumBody);
        } else {
          setDriveSummary(null);
        }
      } else {
        setDriveSummary(null);
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

  useEffect(() => {
    if (!driveProfileId && active?.id) setDriveProfileId(active.id);
  }, [active?.id, driveProfileId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const drive = params.get("drive");
    if (!drive) return;
    if (drive === "connected") {
      setDrivePickerPending(true);
    } else if (drive === "not_configured") {
      setError(
        "Google Drive isn't configured on this deployment. Add GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET, enable the Drive API, and add this app’s callback URL to the Google OAuth client."
      );
    } else if (drive === "denied") {
      setError("Google Drive access was cancelled or denied.");
    } else if (drive === "error") {
      setError("Couldn't connect Google Drive. Try again.");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("drive");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  }, []);

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
    async (
      sourceId: string,
      profileId: string | null | undefined,
      selectedBoardId?: string | null
    ) => {
      const loadBoardItems = async () => {
        const itemsRes = await fetch(`/api/connections/${sourceId}/items`);
        const itemsBody = (await itemsRes.json().catch(() => ({}))) as {
          items?: Array<SourceItem & { id: string }>;
          error?: string;
        };
        if (!itemsRes.ok || !itemsBody.items?.length) {
          return [] as Array<SourceItem & { id: string }>;
        }
        return itemsBody.items.filter((item) =>
          itemBelongsToTrelloBoard(item, selectedBoardId ?? null)
        );
      };

      const queue = await loadBoardItems();
      if (!queue.length) {
        return { analyzed: 0, failed: 0, remaining: 0 };
      }

      const currentVersion = connectorAnalysisVersion();
      const boards = queue.filter((i) => {
        if (i.metadata?.kind !== "board") return false;
        if (isItemNeedsAnalyze(i)) return true;
        return (
          i.processingStatus === "analyzed" &&
          i.analysisVersion !== currentVersion
        );
      });

      let analyzed = 0;
      let failed = 0;
      let boardsDone = 0;

      if (boards.length) {
        setAnalyzeProgress(
          `Reading ${boards.length} board${boards.length === 1 ? "" : "s"}…`
        );
        for (const item of boards) {
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
          boardsDone += 1;
          setAnalyzeProgress(
            `Boards (${boardsDone}/${boards.length})`
          );
        }
      }

      // Auto-continue in batches until the chart queue is empty (or stuck).
      let remaining = 0;
      let chartPasses = 0;
      let chartsAnalyzedThisRun = 0;
      let initialPending = -1;

      while (chartPasses < TRELLO_CHART_MAX_PASSES) {
        const fresh = await loadBoardItems();
        const attachments = fresh.filter(
          (i) => i.metadata?.kind === "attachment"
        );
        const uniqueAttachments = pickUniqueChartsForAnalyze(attachments);
        const pendingCharts = uniqueAttachments
          .filter((i) => {
            if (isItemNeedsAnalyze(i)) return true;
            return (
              i.processingStatus === "analyzed" &&
              i.analysisVersion !== currentVersion
            );
          })
          .sort((a, b) => chartAnalyzePriority(b) - chartAnalyzePriority(a));

        if (initialPending < 0) initialPending = pendingCharts.length;
        remaining = pendingCharts.length;
        if (remaining === 0) break;

        const charts = pendingCharts.slice(0, TRELLO_CHART_BATCH);
        chartPasses += 1;
        let batchDone = 0;
        let batchOk = 0;

        setAnalyzeProgress(
          `Reading chord charts ${chartsAnalyzedThisRun}/${initialPending}` +
            (remaining > charts.length
              ? ` (${remaining} left) — keep this page open`
              : "") +
            "…"
        );

        await runPool(charts, TRELLO_CHART_CONCURRENCY, async (item) => {
          const result = await analyzeSourceItemClient({
            sourceId,
            item,
            profileId: profileId ?? null,
            force:
              item.processingStatus === "analysis_failed" ||
              item.processingStatus === "analyzing",
            remote: true,
            allowUnchangedSkip: true,
          });
          if (result.ok) {
            analyzed += 1;
            batchOk += 1;
            chartsAnalyzedThisRun += 1;
          } else if (!result.cancelled) {
            failed += 1;
          }
          batchDone += 1;
          setAnalyzeProgress(
            `Reading chord charts ${chartsAnalyzedThisRun}/${initialPending}` +
              ` · batch ${batchDone}/${charts.length}` +
              (remaining > charts.length ? ` · ${remaining - batchOk} left` : "") +
              " — keep this page open…"
          );
        });

        // Avoid infinite retry if nothing succeeds in a full batch.
        if (batchOk === 0) {
          remaining = Math.max(0, remaining - charts.length);
          break;
        }
      }

      // Final remaining count after last refresh
      {
        const fresh = await loadBoardItems();
        const uniqueAttachments = pickUniqueChartsForAnalyze(
          fresh.filter((i) => i.metadata?.kind === "attachment")
        );
        remaining = uniqueAttachments.filter((i) => {
          if (isItemNeedsAnalyze(i)) return true;
          return (
            i.processingStatus === "analyzed" &&
            i.analysisVersion !== currentVersion
          );
        }).length;
      }

      setAnalyzeProgress(null);
      return { analyzed, failed, remaining };
    },
    []
  );

  const fetchTrelloBoardList = useCallback(async (sourceId: string) => {
    const res = await fetch(`/api/connections/${sourceId}/trello/boards`);
    const body = (await res.json().catch(() => ({}))) as {
      boards?: Array<{ id: string; name: string }>;
      selectedBoardId?: string | null;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(body.message ?? body.error ?? "Couldn't list Trello boards.");
    }
    const boards = body.boards ?? [];
    setTrelloBoards(boards);
    const selected =
      body.selectedBoardId && boards.some((b) => b.id === body.selectedBoardId)
        ? body.selectedBoardId
        : boards[0]?.id ?? "";
    setTrelloBoardId(selected);
    return boards;
  }, []);

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
      setPendingTrelloSourceId(body.source.id);
      await fetchTrelloBoardList(body.source.id);
      setTrelloModalStep("board");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect Trello.");
    } finally {
      setBusy(null);
    }
  }, [fetchTrelloBoardList, load, trelloApiKey, trelloBoundProfile, trelloToken]);

  const scanSelectedTrelloBoard = useCallback(async () => {
    const sourceId = pendingTrelloSourceId ?? trelloSource?.id;
    if (!sourceId) return;
    const board = trelloBoards.find((b) => b.id === trelloBoardId);
    if (!trelloBoardId || !board) {
      setError("Pick a Trello board to scan.");
      return;
    }
    setBusy("trello-scan");
    setError(null);
    setTrelloNote(null);
    try {
      const patchRes = await fetch(`/api/connections/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trelloBoardId: board.id,
          trelloBoardName: board.name,
        }),
      });
      const patchBody = (await patchRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!patchRes.ok) {
        throw new Error(patchBody.error ?? "Couldn't save that Trello board.");
      }
      const scanRes = await fetch(`/api/connections/${sourceId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const scanBody = (await scanRes.json().catch(() => ({}))) as {
        summary?: ScanResultSummary;
        error?: string;
        message?: string;
      };
      if (scanRes.status === 403 || scanBody.error === "permission_revoked") {
        await load();
        throw new Error(
          scanBody.message ?? "Trello access was revoked. Reconnect with a new token."
        );
      }
      if (!scanRes.ok) {
        throw new Error(
          scanBody.message ?? scanBody.error ?? "Couldn't scan that Trello board."
        );
      }
      setScanResult(scanBody.summary ?? null);
      setBusy("trello-analyze");
      const analyzeStats = await analyzeTrelloAfterScan(
        sourceId,
        trelloBoundProfile?.id ?? trelloSource?.profileId,
        board.id
      );
      setTrelloModalOpen(false);
      setTrelloModalStep("creds");
      setTrelloApiKey("");
      setTrelloToken("");
      setPendingTrelloSourceId(null);
      await load();
      if (analyzeStats.failed > 0 && analyzeStats.analyzed === 0) {
        setError(
          "Connected and scanned, but Analyze failed. Open Browse Boards & Charts and Analyze again."
        );
      } else if (analyzeStats.remaining > 0) {
        setTrelloNote(
          `Analyzed ${analyzeStats.analyzed} item${analyzeStats.analyzed === 1 ? "" : "s"} from ${board.name}. ${analyzeStats.remaining} chord charts still waiting (some may have failed) — press Scan Again to retry the rest.`
        );
      } else if (analyzeStats.analyzed > 0) {
        setTrelloNote(
          `Finished analyzing ${analyzeStats.analyzed} item${analyzeStats.analyzed === 1 ? "" : "s"} from ${board.name}. You can Ask Gideon about those songs.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't scan that Trello board.");
    } finally {
      setAnalyzeProgress(null);
      setBusy(null);
    }
  }, [
    analyzeTrelloAfterScan,
    load,
    pendingTrelloSourceId,
    trelloBoardId,
    trelloBoards,
    trelloBoundProfile?.id,
    trelloSource?.id,
    trelloSource?.profileId,
  ]);

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
    const selectedId = trelloSelectedBoardId(trelloSource.settings);
    if (!selectedId) {
      setBusy("trello-boards");
      setError(null);
      try {
        await fetchTrelloBoardList(trelloSource.id);
        setPendingTrelloSourceId(trelloSource.id);
        setTrelloModalStep("board");
        setTrelloModalOpen(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't list Trello boards."
        );
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy("trello-scan");
    setError(null);
    setTrelloNote(null);
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
      const analyzeStats = await analyzeTrelloAfterScan(
        trelloSource.id,
        trelloSource.profileId ?? trelloBoundProfile?.id,
        selectedId
      );
      await load();
      if (analyzeStats.failed > 0 && analyzeStats.analyzed === 0) {
        setError(
          "Scan finished, but Analyze failed. Press Scan Again or open Browse Boards & Charts."
        );
      } else if (analyzeStats.remaining > 0) {
        setTrelloNote(
          `Analyzed ${analyzeStats.analyzed} item${analyzeStats.analyzed === 1 ? "" : "s"}. ${analyzeStats.remaining} chord charts still waiting (some may have failed) — press Scan Again to retry. You can already Ask Gideon about songs that finished.`
        );
      } else if (analyzeStats.analyzed > 0) {
        setTrelloNote(
          `Finished analyzing ${analyzeStats.analyzed} item${analyzeStats.analyzed === 1 ? "" : "s"}. You can Ask Gideon about those songs.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trello scan failed.");
    } finally {
      setAnalyzeProgress(null);
      setBusy(null);
    }
  }, [
    analyzeTrelloAfterScan,
    fetchTrelloBoardList,
    load,
    trelloBoundProfile?.id,
    trelloSource,
  ]);

  const openTrelloBoardPicker = useCallback(async () => {
    if (!trelloSource) return;
    setBusy("trello-boards");
    setError(null);
    try {
      await fetchTrelloBoardList(trelloSource.id);
      setPendingTrelloSourceId(trelloSource.id);
      setTrelloModalStep("board");
      setTrelloModalOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't list Trello boards."
      );
    } finally {
      setBusy(null);
    }
  }, [fetchTrelloBoardList, trelloSource]);

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

  const analyzeDriveAfterScan = useCallback(
    async (sourceId: string, profileId?: string | null) => {
      const res = await fetch(`/api/connections/${sourceId}/items`);
      const body = (await res.json().catch(() => ({}))) as {
        items?: Array<SourceItem & { id: string }>;
      };
      const queue = (body.items ?? []).filter(isItemNeedsAnalyze);
      let analyzed = 0;
      let failed = 0;
      await runPool(queue, 3, async (item) => {
        if (!item.id) return;
        const result = await analyzeSourceItemClient({
          sourceId,
          item,
          profileId,
          remote: true,
        });
        if (result.ok && !result.skipped) analyzed += 1;
        else if (!result.ok) failed += 1;
      });
      return { analyzed, failed, remaining: queue.length - analyzed - failed };
    },
    []
  );

  const fetchDriveFolderList = useCallback(
    async (
      sourceId: string,
      parentId = "root",
      driveId?: string | null
    ) => {
      const params = new URLSearchParams();
      if (parentId) params.set("parentId", parentId);
      if (driveId) params.set("driveId", driveId);
      const res = await fetch(
        `/api/connections/${sourceId}/google-drive/folders?${params.toString()}`
      );
      const body = (await res.json().catch(() => ({}))) as {
        locations?: Array<{
          id: string;
          name: string;
          kind: string;
          driveId?: string | null;
        }>;
        folders?: Array<{
          id: string;
          name: string;
          kind: string;
          driveId?: string | null;
        }>;
        selectedFolderId?: string | null;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? "Couldn't list Google Drive folders."
        );
      }
      setDriveLocations(body.locations ?? []);
      setDriveFolders(body.folders ?? []);
      setDriveParentId(parentId);
      setDriveParentDriveId(driveId ?? null);
      const selected =
        body.selectedFolderId &&
        (body.selectedFolderId === parentId ||
          (body.folders ?? []).some((f) => f.id === body.selectedFolderId) ||
          (body.locations ?? []).some((l) => l.id === body.selectedFolderId))
          ? body.selectedFolderId
          : parentId;
      setDriveFolderId(selected || parentId);
    },
    []
  );

  const openDriveFolderPicker = useCallback(async () => {
    if (!driveSource) return;
    setBusy("drive-folders");
    setError(null);
    try {
      await fetchDriveFolderList(driveSource.id, "root", null);
      setDriveProfileId(driveSource.profileId || active?.id || "");
      setDriveModalStep("folder");
      setDriveModalOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't list Google Drive folders."
      );
    } finally {
      setBusy(null);
    }
  }, [active?.id, driveSource, fetchDriveFolderList]);

  useEffect(() => {
    if (!drivePickerPending || !driveSource) return;
    setDrivePickerPending(false);
    void openDriveFolderPicker();
  }, [drivePickerPending, driveSource, openDriveFolderPicker]);

  const startGoogleDriveOAuth = useCallback(() => {
    if (!driveProfileId) {
      setError("Pick a Guardian space for these Drive files.");
      return;
    }
    window.location.href = `/api/connections/google-drive/start?profileId=${encodeURIComponent(driveProfileId)}`;
  }, [driveProfileId]);

  const scanSelectedDriveFolder = useCallback(async () => {
    const sourceId = driveSource?.id;
    if (!sourceId) return;
    const fromFolders = driveFolders.find((f) => f.id === driveFolderId);
    const fromLocations = driveLocations.find((l) => l.id === driveFolderId);
    const parentLocation = driveLocations.find((l) => l.id === driveParentId);
    const currentParent = {
      id: driveParentId,
      name:
        parentLocation?.name ??
        (driveParentId === "root" ? "My Drive" : "This folder"),
      kind:
        parentLocation?.kind ??
        (driveParentId === "root" ? "my_drive" : "folder"),
      driveId: driveParentDriveId,
    };
    const picked =
      fromFolders ??
      fromLocations ??
      (driveFolderId === driveParentId ? currentParent : null);
    if (!driveFolderId || !picked) {
      setError("Pick a Google Drive folder or shared drive to scan.");
      return;
    }
    setBusy("drive-scan");
    setError(null);
    setDriveNote(null);
    try {
      if (driveProfileId && driveProfileId !== driveSource?.profileId) {
        const bindRes = await fetch(`/api/connections/${sourceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: driveProfileId }),
        });
        if (!bindRes.ok) {
          const bindBody = (await bindRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(bindBody.error ?? "Couldn't bind Drive to that space.");
        }
      }
      const kind =
        picked.kind === "shared_drive" ||
        picked.kind === "folder" ||
        picked.kind === "my_drive"
          ? picked.kind
          : driveFolderId === "root"
            ? "my_drive"
            : "folder";
      const patchRes = await fetch(`/api/connections/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleDriveFolderId: picked.id,
          googleDriveFolderName: picked.name,
          googleDriveDriveId:
            kind === "shared_drive"
              ? picked.id
              : picked.driveId ?? driveParentDriveId,
          googleDriveFolderKind: kind,
        }),
      });
      const patchBody = (await patchRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!patchRes.ok) {
        throw new Error(patchBody.error ?? "Couldn't save that Drive folder.");
      }
      const scanRes = await fetch(`/api/connections/${sourceId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const scanBody = (await scanRes.json().catch(() => ({}))) as {
        summary?: ScanResultSummary;
        error?: string;
        message?: string;
      };
      if (scanRes.status === 403 || scanBody.error === "permission_revoked") {
        await load();
        throw new Error(
          scanBody.message ?? "Google Drive access was revoked. Reconnect."
        );
      }
      if (!scanRes.ok) {
        throw new Error(
          scanBody.message ?? scanBody.error ?? "Couldn't scan that Drive folder."
        );
      }
      setScanResult(scanBody.summary ?? null);
      setBusy("drive-analyze");
      const stats = await analyzeDriveAfterScan(sourceId, driveProfileId);
      setDriveModalOpen(false);
      await load();
      if (stats.failed > 0 && stats.analyzed === 0) {
        setError(
          "Connected and scanned, but Analyze failed. Open Browse Files and Analyze again."
        );
      } else if (stats.analyzed > 0) {
        setDriveNote(
          `Finished analyzing ${stats.analyzed} file${stats.analyzed === 1 ? "" : "s"} from ${picked.name}. Ask Gideon in the bound space about those files.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't scan that Drive folder."
      );
    } finally {
      setBusy(null);
    }
  }, [
    analyzeDriveAfterScan,
    driveFolderId,
    driveFolders,
    driveLocations,
    driveParentDriveId,
    driveParentId,
    driveProfileId,
    driveSource,
    load,
  ]);

  const scanDriveAgain = useCallback(async () => {
    if (!driveSource) return;
    const selectedId = String(driveSource.settings?.folderId ?? "").trim();
    if (!selectedId) {
      await openDriveFolderPicker();
      return;
    }
    setBusy("drive-scan");
    setError(null);
    setDriveNote(null);
    setScanResult(null);
    try {
      const res = await fetch(`/api/connections/${driveSource.id}/scan`, {
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
          body.message ?? "Google Drive access was revoked. Reconnect."
        );
      }
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't scan Google Drive.");
      }
      setScanResult(body.summary ?? null);
      setBusy("drive-analyze");
      const stats = await analyzeDriveAfterScan(
        driveSource.id,
        driveSource.profileId ?? driveProfileId
      );
      await load();
      if (stats.failed > 0 && stats.analyzed === 0) {
        setError(
          "Scan finished, but Analyze failed. Press Scan Again or open Browse Files."
        );
      } else if (stats.analyzed > 0) {
        setDriveNote(
          `Finished analyzing ${stats.analyzed} file${stats.analyzed === 1 ? "" : "s"}. Ask Gideon in the bound space about those files.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Drive scan failed.");
    } finally {
      setBusy(null);
    }
  }, [
    analyzeDriveAfterScan,
    driveProfileId,
    driveSource,
    load,
    openDriveFolderPicker,
  ]);

  const bindDriveToSpace = useCallback(async () => {
    if (!driveSource || !driveProfileId) return;
    setBusy("drive-bind");
    setError(null);
    try {
      const res = await fetch(`/api/connections/${driveSource.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: driveProfileId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't bind Google Drive to that space.");
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't bind Google Drive to that space."
      );
    } finally {
      setBusy(null);
    }
  }, [driveProfileId, driveSource, load]);

  const disconnectDrive = useCallback(async () => {
    if (!driveSource) return;
    setBusy("drive-disconnect");
    setError(null);
    try {
      const res = await fetch(`/api/connections/${driveSource.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't disconnect Google Drive.");
      }
      setConfirmDriveDisconnect(false);
      setScanResult(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't disconnect Google Drive."
      );
    } finally {
      setBusy(null);
    }
  }, [driveSource, load]);

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
  const trelloBoardName =
    trelloSelectedBoardName(trelloSource?.settings) ??
    trelloBoards.find((b) => b.id === trelloSelectedBoardId(trelloSource?.settings))
      ?.name ??
    null;
  const driveConnected =
    driveSource?.status === "connected" || driveSource?.status === "error";
  const driveRevoked = driveSource?.status === "permission_revoked";
  const driveEmail = String(driveSource?.settings?.email ?? "");
  const driveFolderName =
    googleDriveSelectedFolderName(driveSource?.settings) ??
    (String(driveSource?.settings?.folderId ?? "") === "root"
      ? "My Drive"
      : null);
  const driveBoundSpaceName = driveSource?.profileId
    ? profiles.find((p) => p.id === driveSource.profileId)?.display_name ??
      "Another space"
    : "Not bound to a space";
  const trelloCanManage = trelloSource?.canManage ?? true;
  const trelloCanUseSecrets = trelloSource?.canUseSecrets ?? true;
  const trelloIsShared = trelloSource?.access === "shared";
  const driveCanManage = driveSource?.canManage ?? true;
  const driveCanUseSecrets = driveSource?.canUseSecrets ?? true;
  const driveIsShared = driveSource?.access === "shared";
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
                      {trelloCanManage
                        ? "Trello rejected the saved token. Connect again with a fresh token."
                        : "Trello access for this space needs to be refreshed by the connection owner."}
                    </p>
                    {trelloCanManage ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTrelloModalStep("creds");
                          setTrelloModalOpen(true);
                        }}
                        disabled={busy !== null}
                        className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                      >
                        Reconnect Trello
                      </button>
                    ) : null}
                  </>
                ) : trelloConnected && trelloSource ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="ok" />
                      {trelloIsShared ? "Connected (shared space)" : "Connected"}
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
                        <dt className="text-ink-muted">Board</dt>
                        <dd className="font-medium text-foreground">
                          {trelloBoardName ?? "Pick a board to scan"}
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
                        <dt className="text-ink-muted">Items on board</dt>
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
                    {trelloSource.profileId ? (
                      <p className="mt-3 text-sm text-ink-muted">
                        {trelloIsShared ? (
                          <>
                            This Trello board is connected by the space owner.
                            Charts are available in{" "}
                            <span className="font-medium text-foreground">
                              {profiles.find((p) => p.id === trelloSource.profileId)
                                ?.display_name ?? "the bound space"}
                            </span>
                            . Ask Gideon there — you do not need your own API
                            token.
                          </>
                        ) : (
                          <>
                            Charts from{" "}
                            <span className="font-medium text-foreground">
                              {trelloBoardName ?? "the selected board"}
                            </span>{" "}
                            analyze into{" "}
                            <span className="font-medium text-foreground">
                              {profiles.find((p) => p.id === trelloSource.profileId)
                                ?.display_name ?? "the bound space"}
                            </span>
                            . Ask Gideon there — not from Connections.
                          </>
                        )}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-amber-800">
                        Bind Trello to a space so Ask Gideon can see scanned
                        charts there.
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {trelloCanManage &&
                      trelloBoundProfile &&
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
                        Browse Boards & Charts
                      </Link>
                      {trelloCanUseSecrets ? (
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
                                ? "Reading charts…"
                                : "Scanning…"}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                              Scan Again
                            </>
                          )}
                        </button>
                      ) : null}
                      {trelloCanManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void openTrelloBoardPicker()}
                            disabled={busy !== null}
                            className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                          >
                            {busy === "trello-boards" ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading boards…
                              </>
                            ) : (
                              "Change board"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTrelloModalStep("creds");
                              setTrelloModalOpen(true);
                            }}
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
                        </>
                      ) : null}
                    </div>
                    {analyzeProgress ? (
                      <p className="mt-3 text-sm text-ink-muted">
                        {analyzeProgress}
                      </p>
                    ) : null}
                    {trelloNote ? (
                      <p className="mt-3 text-sm text-ink-muted">{trelloNote}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="off" />
                      Not Connected
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Connect with your Trello API key and token, then pick one
                      board. Chord-chart images (JPG/PNG) or PDFs on that board
                      analyze into{" "}
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
                      onClick={() => {
                        setTrelloModalStep("creds");
                        setTrelloModalOpen(true);
                      }}
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

          {/* Google Drive */}
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-muted">
                <Cloud className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  Google Drive
                </h2>

                {driveRevoked ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      Access Required
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Google Drive rejected the saved access. Connect again to
                      grant Drive permission.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDriveProfileId(
                          driveSource?.profileId || active?.id || ""
                        );
                        setDriveModalStep("space");
                        setDriveModalOpen(true);
                      }}
                      disabled={busy !== null}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      Reconnect Google Drive
                    </button>
                  </>
                ) : driveConnected && driveSource ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="ok" />
                      {driveIsShared ? "Connected (shared space)" : "Connected"}
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Account</dt>
                        <dd className="font-medium text-foreground">
                          {driveEmail || driveSource.displayName || "Google Drive"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Folder</dt>
                        <dd className="font-medium text-foreground">
                          {driveFolderName ?? "Pick a folder to scan"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Bound space</dt>
                        <dd className="font-medium text-foreground">
                          {driveBoundSpaceName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Files indexed</dt>
                        <dd className="font-medium text-foreground">
                          {driveSummary?.total ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-muted">Last scanned</dt>
                        <dd className="font-medium text-foreground">
                          {formatLastScanned(
                            driveSummary?.lastScanAt ?? driveSource.lastScanAt
                          )}
                        </dd>
                      </div>
                    </dl>
                    {driveSource.profileId ? (
                      <p className="mt-3 text-sm text-ink-muted">
                        Files from{" "}
                        <span className="font-medium text-foreground">
                          {driveFolderName ?? "the selected folder"}
                        </span>{" "}
                        analyze into{" "}
                        <span className="font-medium text-foreground">
                          {driveBoundSpaceName}
                        </span>
                        . Ask Gideon there — not from Connections.
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-amber-800">
                        Bind Google Drive to a space so Ask Gideon can see
                        scanned files there.
                      </p>
                    )}
                    <label className="mt-4 block text-sm font-medium text-foreground">
                      Space
                      <select
                        value={driveProfileId || driveSource.profileId || ""}
                        onChange={(e) => setDriveProfileId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                      >
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {driveProfileId &&
                      driveProfileId !== driveSource.profileId ? (
                        <button
                          type="button"
                          onClick={() => void bindDriveToSpace()}
                          disabled={busy !== null}
                          className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                        >
                          {busy === "drive-bind" ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Binding…
                            </>
                          ) : (
                            `Bind to ${
                              profiles.find((p) => p.id === driveProfileId)
                                ?.display_name ?? "this space"
                            }`
                          )}
                        </button>
                      ) : null}
                      <Link
                        href={`/settings/connections/${driveSource.id}`}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                      >
                        Browse Files
                      </Link>
                      <button
                        type="button"
                        onClick={() => void scanDriveAgain()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        {busy === "drive-scan" || busy === "drive-analyze" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {busy === "drive-analyze"
                              ? "Reading files…"
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
                        onClick={() => void openDriveFolderPicker()}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50 disabled:opacity-60"
                      >
                        {busy === "drive-folders" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading folders…
                          </>
                        ) : (
                          "Change folder"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDriveDisconnect(true)}
                        disabled={busy !== null}
                        className="inline-flex items-center justify-center rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Disconnect
                      </button>
                    </div>
                    {driveNote ? (
                      <p className="mt-3 text-sm text-ink-muted">{driveNote}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                      <StatusDot tone="off" />
                      Not Connected
                    </p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Connect Google Drive, pick a Guardian space, then choose
                      My Drive, a shared drive, or a folder. Files analyze into
                      that space so Gideon can answer from them.
                    </p>
                    {!profiles.length ? (
                      <p className="mt-2 text-sm text-amber-800">
                        Create a space first, then connect Google Drive.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setDriveProfileId(active?.id || profiles[0]?.id || "");
                        setDriveModalStep("space");
                        setDriveModalOpen(true);
                      }}
                      disabled={busy !== null || !profiles.length}
                      className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      Connect Google Drive
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Coming soon */}
          {[
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
              {trelloModalStep === "board" ? "Choose a Trello board" : "Connect Trello"}
            </h3>
            {trelloModalStep === "board" ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">
                  Guardian will scan and analyze only this board — including
                  chord-chart JPGs, PNGs, and PDFs on its cards.
                </p>
                <label className="mt-4 block text-sm font-medium text-foreground">
                  Board
                  <select
                    value={trelloBoardId}
                    onChange={(e) => setTrelloBoardId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    {trelloBoards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTrelloModalOpen(false);
                      setTrelloModalStep("creds");
                      setPendingTrelloSourceId(null);
                    }}
                    className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void scanSelectedTrelloBoard()}
                    disabled={busy !== null || !trelloBoardId}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {busy === "trello-scan" || busy === "trello-analyze" ? (
                      <>
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        {busy === "trello-analyze"
                          ? analyzeProgress ?? "Reading charts…"
                          : "Scanning…"}
                      </>
                    ) : (
                      "Scan this board"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
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
                  setTrelloModalStep("creds");
                  setTrelloApiKey("");
                  setTrelloToken("");
                  setPendingTrelloSourceId(null);
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
                      ? analyzeProgress ?? "Reading charts…"
                      : "Connecting…"}
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {confirmDriveDisconnect ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-disconnect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="drive-disconnect-title"
              className="text-lg font-semibold text-foreground"
            >
              Disconnect Google Drive?
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Guardian will stop syncing Drive files. Saved Google access is
              removed from this connection.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDriveDisconnect(false)}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void disconnectDrive()}
                disabled={busy !== null}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === "drive-disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {driveModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drive-connect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="drive-connect-title"
              className="text-lg font-semibold text-foreground"
            >
              {driveModalStep === "folder"
                ? "Choose a Drive folder"
                : "Connect Google Drive"}
            </h3>
            {driveModalStep === "folder" ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">
                  Pick a Guardian space, then a Drive location. Guardian scans
                  that folder (including subfolders, up to 400 files).
                </p>
                <label className="mt-4 block text-sm font-medium text-foreground">
                  Space
                  <select
                    value={driveProfileId}
                    onChange={(e) => setDriveProfileId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm font-medium text-foreground">
                  Location
                  <select
                    value={
                      driveLocations.some((l) => l.id === driveParentId)
                        ? driveParentId
                        : driveParentDriveId || "root"
                    }
                    onChange={(e) => {
                      const loc = driveLocations.find(
                        (l) => l.id === e.target.value
                      );
                      if (!driveSource || !loc) return;
                      setDriveFolderId(loc.id);
                      void fetchDriveFolderList(
                        driveSource.id,
                        loc.id,
                        loc.kind === "shared_drive" ? loc.id : null
                      ).catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Couldn't list that Drive location."
                        )
                      );
                    }}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    {driveLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm font-medium text-foreground">
                  Folder
                  <select
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value={driveParentId}>
                      {driveLocations.find((l) => l.id === driveParentId)?.name ??
                        "This folder"}{" "}
                      (scan here)
                    </option>
                    {driveFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                {driveFolders.some((f) => f.id === driveFolderId) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!driveSource) return;
                      const folder = driveFolders.find(
                        (f) => f.id === driveFolderId
                      );
                      if (!folder) return;
                      void fetchDriveFolderList(
                        driveSource.id,
                        folder.id,
                        folder.driveId ?? driveParentDriveId
                      ).catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Couldn't open that folder."
                        )
                      );
                    }}
                    className="mt-2 text-sm font-semibold text-brand hover:text-brand-dark"
                  >
                    Open this folder
                  </button>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDriveModalOpen(false);
                      setDriveModalStep("space");
                    }}
                    className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void scanSelectedDriveFolder()}
                    disabled={busy !== null || !driveFolderId}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    {busy === "drive-scan" || busy === "drive-analyze" ? (
                      <>
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        {busy === "drive-analyze"
                          ? "Reading files…"
                          : "Scanning…"}
                      </>
                    ) : (
                      "Scan this folder"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-muted">
                  Choose which Guardian space should receive analyzed Drive
                  files, then continue with Google.
                </p>
                <label className="mt-4 block text-sm font-medium text-foreground">
                  Space
                  <select
                    value={driveProfileId}
                    onChange={(e) => setDriveProfileId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDriveModalOpen(false)}
                    className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={startGoogleDriveOAuth}
                    disabled={!driveProfileId}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                  >
                    Continue with Google
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
