"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  GUARDIAN_STATUS_LABELS,
  SOURCE_LABELS,
  type Fact,
  type GuardianStatus,
} from "@/lib/analysis";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

type SharePayload = {
  document: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    category: string | null;
    uploadedAt: string;
  };
  analysis: {
    summary: string;
    facts: Fact[];
    title: string | null;
    documentType: string | null;
    guardianStatus: GuardianStatus | null;
    overallConfidence: number | null;
    classificationConfidence: number | null;
  } | null;
  includeFile: boolean;
  fileUrl: string | null;
  expiresAt: string;
};

const SOURCE_BADGE_STYLES: Record<Fact["source"], string> = {
  document: "bg-brand-light text-brand-dark",
  calculated: "bg-sky-50 text-sky-700",
  ai_generated: "bg-violet-50 text-violet-700",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: GUARDIAN_TIME_ZONE,
  });
}

export default function SharedDocumentView({ token }: { token: string }) {
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        } & Partial<SharePayload>;
        if (!res.ok) {
          if (!cancelled) setError(body.error ?? "Couldn't open this share.");
          return;
        }
        if (!cancelled) setData(body as SharePayload);
      } catch {
        if (!cancelled) setError("Couldn't open this share.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading shared document…
      </p>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h1 className="text-xl font-bold tracking-tight">Link unavailable</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {error ?? "This share link is invalid or no longer available."}
        </p>
      </div>
    );
  }

  const { document: doc, analysis } = data;
  const facts = Array.isArray(analysis?.facts) ? analysis!.facts : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Shared document
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {analysis?.title?.trim() || doc.fileName}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {doc.fileName}
          {doc.category ? ` · ${doc.category}` : ""} · {formatSize(doc.sizeBytes)} ·
          uploaded {formatDate(doc.uploadedAt)}
        </p>
        {analysis?.documentType || analysis?.guardianStatus ? (
          <p className="mt-1 text-sm text-ink-muted">
            {[
              analysis.documentType,
              analysis.guardianStatus
                ? GUARDIAN_STATUS_LABELS[analysis.guardianStatus]
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-ink-muted">
          Link expires {formatDate(data.expiresAt)}
        </p>
        {data.includeFile && data.fileUrl ? (
          <a
            href={data.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Download className="h-4 w-4" />
            Open file
          </a>
        ) : data.includeFile ? (
          <p className="mt-4 text-sm text-amber-800">
            File access was enabled but the file link couldn&apos;t be created.
          </p>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">
            The file itself was not included — summary and facts only.
          </p>
        )}
      </div>

      {analysis ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Summary</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {analysis.summary}
          </p>
          {facts.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">Key facts</h3>
              <ul className="mt-3 space-y-3">
                {facts.map((fact, i) => (
                  <li
                    key={`${fact.label}-${i}`}
                    className="rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{fact.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_BADGE_STYLES[fact.source]}`}
                      >
                        {SOURCE_LABELS[fact.source]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{fact.value}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-ink-muted">
          No analysis is available for this document yet.
        </div>
      )}
    </div>
  );
}
