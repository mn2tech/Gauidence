"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";

type DocRow = {
  id: string;
  fileName: string;
  category: string | null;
  clientVisible: boolean;
  createdAt: string;
  analysisStatus: string | null;
};

type Props = {
  profileId: string;
  vaultName?: string;
  /** Override heading — business Spaces use "viewers" not "clients". */
  audienceLabel?: "clients" | "viewers";
};

export default function ClientSharingPanel({
  profileId,
  vaultName,
  audienceLabel = "clients",
}: Props) {
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/client-sharing`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        documents?: DocRow[];
        viewerCount?: number;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load client sharing settings.");
        return;
      }
      setDocuments(body.documents ?? []);
      setViewerCount(body.viewerCount ?? 0);
    } catch {
      setError("Couldn't load client sharing settings.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sharedCount = useMemo(
    () => documents.filter((d) => d.clientVisible).length,
    [documents]
  );

  const patch = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/profiles/${profileId}/client-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(body.error ?? "Couldn't update sharing.");
    }
    await load();
  };

  const toggleDoc = async (doc: DocRow) => {
    setBusyId(doc.id);
    setError(null);
    try {
      await patch({
        documentId: doc.id,
        clientVisible: !doc.clientVisible,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update sharing.");
    } finally {
      setBusyId(null);
    }
  };

  const setAll = async (clientVisible: boolean) => {
    setBulkBusy(true);
    setError(null);
    try {
      await patch({ all: true, clientVisible });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update sharing.");
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client document access…
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <Shield className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            What {audienceLabel} can see
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {vaultName ? (
              <>
                Viewers invited to <strong>{vaultName}</strong> only see documents
                you mark as shared. Other Spaces stay private. Internal notes and
                Daily Logs are never visible to viewers.
              </>
            ) : (
              <>
                Viewers only see documents you mark as shared. Internal notes and
                Daily Logs are never visible to viewers.
              </>
            )}
          </p>
          <p className="mt-2 text-xs font-medium text-foreground">
            {sharedCount} of {documents.length} document
            {documents.length === 1 ? "" : "s"} shared
            {viewerCount > 0
              ? ` · ${viewerCount} viewer${viewerCount === 1 ? "" : "s"} invited`
              : " · invite viewers as View (not Editor)"}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {documents.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void setAll(true)}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            Share all
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void setAll(false)}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
          >
                Hide all from {audienceLabel}
          </button>
        </div>
      ) : null}

      <ul className="mt-4 max-h-80 divide-y divide-stone-100 overflow-y-auto">
        {documents.length === 0 ? (
          <li className="py-3 text-xs text-ink-muted">
            No documents in this vault yet. Upload files, then choose which ones
            clients can access before inviting them.
          </li>
        ) : (
          documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.fileName}</p>
                <p className="text-[11px] text-ink-muted">
                  {doc.category?.trim() || "Uncategorized"}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === doc.id || bulkBusy}
                onClick={() => void toggleDoc(doc)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  doc.clientVisible
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                    : "bg-stone-100 text-ink-muted ring-1 ring-stone-200"
                }`}
              >
                {busyId === doc.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : doc.clientVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {doc.clientVisible ? "Shared" : "Hidden"}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
