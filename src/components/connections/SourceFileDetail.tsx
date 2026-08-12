"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { classifyFileType } from "@/lib/connectors/classify";
import { isSourceItemAnalyzeEnabled } from "@/lib/connectors/features";
import { ConnectorError, type ConnectedSource, type SourceItem } from "@/lib/connectors/types";
import {
  formatBytes,
  formatModified,
} from "@/lib/connectors/services/sourceItems";
import {
  hashSourceBytes,
  readSourceItemContent,
} from "@/lib/connectors/content/readClient";
import { isAnalyzeSupportedMime } from "@/lib/connectors/content/types";

type Props = {
  sourceId: string;
  itemId: string;
};

type AnalysisEntity = {
  id: string;
  entity_type: string;
  name: string;
  confidence: number | null;
  review_status: string | null;
};

type AnalysisRelationship = {
  id: string;
  relationship_type: string;
  confidence: number | null;
  review_status: string | null;
  source_name: string;
  target_name: string;
};

type AnalysisResult = {
  skipped?: boolean;
  profileId: string;
  entitiesFound: number;
  relationshipsFound: number;
  confidence: string;
  entities: AnalysisEntity[];
  relationships: AnalysisRelationship[];
};

export default function SourceFileDetail({ sourceId, itemId }: Props) {
  const [item, setItem] = useState<(SourceItem & { id: string }) | null>(null);
  const [source, setSource] = useState<ConnectedSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const analyzeEnabled = isSourceItemAnalyzeEnabled();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${sourceId}/items/${itemId}`);
      const body = (await res.json().catch(() => ({}))) as {
        item?: SourceItem & { id: string };
        source?: ConnectedSource;
        error?: string;
      };
      if (!res.ok || !body.item) {
        setError(body.error ?? "Couldn't load file details.");
        return;
      }
      setItem(body.item);
      setSource(body.source ?? null);

      if (body.item.processingStatus === "analyzed") {
        const aRes = await fetch(
          `/api/connections/${sourceId}/items/${itemId}/analysis`
        );
        const aBody = (await aRes.json().catch(() => ({}))) as {
          profileId?: string | null;
          entities?: AnalysisEntity[];
          relationships?: AnalysisRelationship[];
        };
        if (aRes.ok && aBody.profileId) {
          setAnalysis({
            profileId: aBody.profileId,
            entitiesFound: aBody.entities?.length ?? 0,
            relationshipsFound: aBody.relationships?.length ?? 0,
            confidence: "—",
            entities: aBody.entities ?? [],
            relationships: aBody.relationships ?? [],
          });
        }
      }
    } catch {
      setError("Network unavailable. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [itemId, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAnalyze = useCallback(async () => {
    if (!item?.id) return;
    setAnalyzing(true);
    setError(null);
    try {
      const content = await readSourceItemContent(item);
      if (!content.bytes) {
        throw new Error("Couldn't read file bytes for analysis.");
      }
      const contentHash = await hashSourceBytes(content.bytes);
      const form = new FormData();
      const ab = content.bytes.buffer.slice(
        content.bytes.byteOffset,
        content.bytes.byteOffset + content.bytes.byteLength
      ) as ArrayBuffer;
      form.append(
        "file",
        new File([ab], content.filename, { type: content.mimeType })
      );
      form.append("contentHash", contentHash);
      if (content.text) form.append("text", content.text);
      if (
        item.processingStatus === "analyzed" ||
        item.processingStatus === "analysis_failed"
      ) {
        form.append("force", "1");
      }

      const res = await fetch(
        `/api/connections/${sourceId}/items/${itemId}/analyze`,
        { method: "POST", body: form }
      );
      const body = (await res.json().catch(() => ({}))) as AnalysisResult & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (body.code === "permission_revoked") {
          throw new ConnectorError(
            "permission_revoked",
            body.error ?? "Access to this folder was revoked."
          );
        }
        throw new Error(body.error ?? "Analysis failed.");
      }
      setAnalysis(body);
      await load();
    } catch (err) {
      if (err instanceof ConnectorError && err.code === "cancelled") {
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Analysis failed.");
      }
    } finally {
      setAnalyzing(false);
    }
  }, [item, itemId, load, sourceId]);

  const setReview = useCallback(
    async (
      kind: "entity" | "relationship",
      id: string,
      status: "confirmed" | "rejected"
    ) => {
      if (!analysis?.profileId) return;
      setReviewBusy(`${kind}:${id}`);
      try {
        const res = await fetch("/api/ontology/review", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: analysis.profileId,
            kind,
            id,
            status,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          // Review API may be feature-gated; surface a clear message.
          throw new Error(
            body.error ??
              "Couldn't update review status. Ontology review may be disabled on this deployment."
          );
        }
        setAnalysis((prev) => {
          if (!prev) return prev;
          if (kind === "entity") {
            return {
              ...prev,
              entities: prev.entities.map((e) =>
                e.id === id ? { ...e, review_status: status } : e
              ),
            };
          }
          return {
            ...prev,
            relationships: prev.relationships.map((r) =>
              r.id === id ? { ...r, review_status: status } : r
            ),
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Review update failed.");
      } finally {
        setReviewBusy(null);
      }
    },
    [analysis?.profileId]
  );

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </p>
    );
  }

  if (error && !item) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </p>
    );
  }

  if (!item) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        File not found.
      </p>
    );
  }

  const folder =
    (item.metadata?.parentFolder as string | undefined) ||
    String(source?.settings?.folderName ?? "—");
  const type = classifyFileType(item.name, item.mimeType);
  const supported = isAnalyzeSupportedMime(item.mimeType, item.name);
  const accessible = item.processingStatus !== "unavailable";
  const canAnalyze =
    analyzeEnabled && accessible && supported && !analyzing;

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
            <dd className="font-medium text-foreground">Device Storage</dd>
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
              {item.processingStatus.replace(/_/g, " ")}
            </dd>
          </div>
        </dl>

        <div className="mt-8 space-y-3">
          {analyzeEnabled ? (
            <button
              type="button"
              onClick={() => void runAnalyze()}
              disabled={!canAnalyze}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {analyzing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </span>
              ) : item.processingStatus === "analyzed" ? (
                "Analyze again"
              ) : (
                "Analyze with Guardian"
              )}
            </button>
          ) : null}
          <p className="text-xs text-ink-muted">
            Guardian reads this file temporarily to extract knowledge. The
            original stays on your device — nothing is copied into Guardian
            storage. If folder access expired, your browser will ask you to
            pick this one file again.
          </p>
          {!supported ? (
            <p className="text-xs text-amber-800">
              Supported for Analyze: PDF, images, text, CSV, and Excel.
            </p>
          ) : null}
          {!accessible ? (
            <p className="text-xs text-amber-800">
              This file is unavailable. Reconnect the folder and scan again.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {analysis ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Analysis Complete
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Source · {item.name}</p>
          {analysis.skipped ? (
            <p className="mt-2 text-sm text-ink-muted">
              Already analyzed — showing existing knowledge (no duplicates
              created).
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Entities found</dt>
              <dd className="text-xl font-semibold text-foreground">
                {analysis.entitiesFound}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Relationships found</dt>
              <dd className="text-xl font-semibold text-foreground">
                {analysis.relationshipsFound}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Confidence</dt>
              <dd className="text-xl font-semibold text-foreground">
                {analysis.confidence}
              </dd>
            </div>
          </dl>

          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Review</h3>
            {analysis.entities.length === 0 &&
            analysis.relationships.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No entities or relationships were found in this file.
              </p>
            ) : null}

            <ul className="space-y-3">
              {analysis.entities.map((entity) => (
                <li
                  key={entity.id}
                  className="rounded-xl border border-stone-200 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    {entity.entity_type}
                  </p>
                  <p className="font-medium text-foreground">{entity.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Confidence:{" "}
                    {entity.confidence != null
                      ? `${Math.round(entity.confidence * 100)}%`
                      : "—"}{" "}
                    · {entity.review_status ?? "pending"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reviewBusy !== null}
                      onClick={() =>
                        void setReview("entity", entity.id, "confirmed")
                      }
                      className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold hover:bg-stone-50 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={reviewBusy !== null}
                      onClick={() =>
                        void setReview("entity", entity.id, "rejected")
                      }
                      className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}

              {analysis.relationships.map((rel) => (
                <li
                  key={rel.id}
                  className="rounded-xl border border-stone-200 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Relationship
                  </p>
                  <p className="font-medium text-foreground">
                    {rel.source_name} → {rel.relationship_type} →{" "}
                    {rel.target_name}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Confidence:{" "}
                    {rel.confidence != null
                      ? `${Math.round(rel.confidence * 100)}%`
                      : "—"}{" "}
                    · {rel.review_status ?? "pending"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reviewBusy !== null}
                      onClick={() =>
                        void setReview("relationship", rel.id, "confirmed")
                      }
                      className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold hover:bg-stone-50 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={reviewBusy !== null}
                      onClick={() =>
                        void setReview("relationship", rel.id, "rejected")
                      }
                      className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {analysis.profileId ? (
              <Link
                href={`/settings/ontology?profileId=${encodeURIComponent(analysis.profileId)}`}
                className="inline-flex text-sm font-semibold text-brand hover:text-brand-dark"
              >
                Review Ontology →
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
